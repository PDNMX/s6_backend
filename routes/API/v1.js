var express = require('express');
var cors = require ('cors');

var router = express.Router();
router.use(cors());

let dbConfig = require('../../db_conf');
const MongoClient = require('mongodb').MongoClient;
const suppliers = require('../../suppliers.json')

router.get('/',(req, res) => {
    console.log(process.env)
    res.json({
        version: 1.0
    });
});

router.get('/summary', (req, res) => {

    //console.log(dbConfig);
    const {supplier_id} = req.query;

    //console.log(supplier_id);

    let supplier = suppliers[0];
    if (typeof supplier_id !== "undefined" && supplier_id !== null){
        supplier = suppliers.find(s => s.id === supplier_id);
    }

    //console.log(supplier)

    if (!supplier) {
        return res.status(404).json({
            error: 'Supplier not found',
            message: `Supplier with id ${supplier_id} not found`
        });
    }

    const {collections} = supplier;

    // Verificar que las colecciones estén definidas
    if (!collections) {
        return res.status(500).json({
            error: 'Collections not configured',
            message: 'No collections configuration found for this supplier'
        });
    }

    MongoClient.connect(dbConfig.url, dbConfig.client_options).then(client => {
        let db = client.db(dbConfig.dbname);
   //console.log(collections)
        // Función auxiliar para ejecutar consulta de manera segura
        const safeQuery = async (collectionName, queryFn) => {
            if (!collectionName) {
                return queryFn.name === 'countDocuments' ? 0 : null;
            }
            
            try {
                const collection = db.collection(collectionName);
                return await queryFn(collection);
            } catch (error) {
                console.log(`Error in collection ${collectionName}:`, error.message);
                return queryFn.name === 'countDocuments' ? 0 : null;
            }
        };

        // Definir las consultas como funciones
        const countAll = (col) => col.countDocuments();
        const countOpen = (col) => col.countDocuments({"tender.procurementMethod": { $regex: "open", $options: "i"}});
        const countSelective = (col) => col.countDocuments({"tender.procurementMethod": { $regex: "selective", $options: "i"}});
        const countDirect = (col) => col.countDocuments({"tender.procurementMethod": { $regex: "direct", $options: "i"}});
        const findOneTotal = (col) => col.findOne();
        const findOpen = (col) => col.findOne({'_id': 'open'});
        const findSelective = (col) => col.findOne({'_id': 'selective'});
        const findDirect = (col) => col.findOne({'_id': 'direct'});
        const findOther = (col) => col.findOne({'_id': null});

        Promise.all([
            safeQuery(collections.releases, countAll),                    // d[0] - procedimientos
            safeQuery(collections.buyers, countAll),                     // d[1] - instituciones
            safeQuery(collections.releases, countOpen),                  // d[2] - open
            safeQuery(collections.releases, countSelective),             // d[3] - selective
            safeQuery(collections.releases, countDirect),                // d[4] - direct
            safeQuery(collections.agg_contracts_total, findOneTotal),    // d[5] - total amount
            safeQuery(collections.agg_contracts_procurement_method, findOpen),      // d[6] - open amount
            safeQuery(collections.agg_contracts_procurement_method, findSelective), // d[7] - selective amount
            safeQuery(collections.agg_contracts_procurement_method, findDirect),    // d[8] - direct amount
            safeQuery(collections.agg_contracts_procurement_method, findOther)      // d[9] - other amount
        ]).then(d => {
            
            const safeTotal = (obj) => obj && typeof obj.total === 'number' ? obj.total : 0;
            const safeCount = (count) => typeof count === 'number' ? count : 0;

            const procedimientos = safeCount(d[0]);
            const open = safeCount(d[2]);
            const selective = safeCount(d[3]);
            const direct = safeCount(d[4]);

            res.json({
                procedimientos: procedimientos,
                instituciones: safeCount(d[1]),
                counts: {
                    open: open,
                    selective: selective,
                    direct: direct,
                    other: Math.max(0, procedimientos - (open + selective + direct))
                },
                amounts: {
                    total: safeTotal(d[5]),
                    open: safeTotal(d[6]),
                    selective: safeTotal(d[7]),
                    direct: safeTotal(d[8]),
                    other: safeTotal(d[9])
                }
            });

            client.close();

        }).catch(error => {
            console.error('Error executing queries:', error);
            client.close();
            res.status(500).json({
                error: 'Database query error',
                message: 'Error executing database queries',
                details: error.message
            });
        });

    }).catch(error => {
        console.error('Error de conexión a base de datos:', error);
        res.status(500).json({
            error: 'Error de conexión a base de datos',
            message: 'No se pudo conectar a la base de datos',
            details: error.message
        });
    });
});

router.get('/buyers', (req,res) => {

    const {supplier_id} = req.query;

    let supplier = suppliers[0];
    if (typeof supplier_id !== "undefined" && supplier_id !== null){
        supplier = suppliers.find(s => s.id === supplier_id);
    }
    const {collections} = supplier;

    MongoClient.connect(dbConfig.url,dbConfig.client_options).then( client => {
        const db = client.db(dbConfig.dbname);
        const buyers = db.collection(collections.buyers);
        buyers.find().toArray().then(data => {
            res.json(data)
        }); //catch
    });

});


router.post('/search', (req, res)=> {
    const MAX_RESULTS = 10;

    //get supplier.id from query
    const {supplier_id} = req.query;

    let supplier = suppliers[0];
    if (typeof supplier_id !== "undefined" && supplier_id !== null){
        supplier = suppliers.find(s => s.id === supplier_id);
    }
    const {collections} = supplier;

    let pageSize = req.body.pageSize || MAX_RESULTS;
    let page = req.body.page || 0;
    let {contract_title,
        ocid,
        //buyer_id,
        buyer_name,
        procurementMethod,
        supplierName,
        tender_title,
        cycle} = req.body;

    if (isNaN(page)){
        page = 0;
    } else {
        page = Math.abs(page)
    }

    if (isNaN(pageSize)){
        pageSize = MAX_RESULTS;
    }else{
        pageSize = Math.abs(pageSize);
        pageSize = pageSize > 200?200:pageSize;
    }


    MongoClient.connect(dbConfig.url,dbConfig.client_options).then( client => {

        let db = client.db(dbConfig.dbname);
        let collection = db.collection(collections.releases);

        let query = {
        };

        //if (typeof buyer_id !== 'undefined'){
        if (typeof buyer_name !== 'undefined'){
            //query["buyer.id"] = buyer_id ; // cambiar por buyer name
            query["buyer.name"] = {$regex: buyer_name, $options: 'i'};
        }

        if (typeof procurementMethod !== 'undefined'){
            query["tender.procurementMethod"] = procurementMethod;
        }

        if (typeof contract_title !== 'undefined'){
            query["contracts.title"] = {$regex: contract_title, $options: 'i'};
        }

        if (typeof tender_title !== 'undefined'){
            query["tender.title"] = {$regex: tender_title, $options: 'i'};
        }

        if (typeof cycle !== 'undefined'){
            query["cycle"] = cycle
        }

        if (typeof supplierName !== 'undefined'){
            query["$and"] = [
                {
                    "parties.name":{
                        $regex: supplierName, $options: 'i'
                    }
                },
                {"parties.roles": 'buyer'}
            ]
        }

        if (typeof  ocid !==  'undefined'){
            query["ocid"] = ocid
        }

        let options = {
            limit : pageSize,
            skip : page * pageSize,
            sort: { cycle: -1, date: -1}
        };

        collection.countDocuments(query).then( count => {
            //res.json(count)
            collection.find(query, options).toArray((error, data) => {
                res.json ({
                    pagination: {
                        total : count,
                        page: page,
                        pageSize: pageSize
                    },
                    data: data,
                });
            })

        })
    });
});

router.get('/releases/:ocid', (req, res) => {

    const {ocid} = req.params;
    const {supplier_id} = req.query;

    let supplier = suppliers[0];
    if (typeof supplier_id !== "undefined" && supplier_id !== null){
        supplier = suppliers.find(s => s.id === supplier_id);
    }
    const {collections} = supplier;

    MongoClient.connect(dbConfig.url, dbConfig.client_options).then( client => {
        const db = client.db(dbConfig.dbname);


        db.collection(collections.releases).find({ocid: ocid}).toArray((error, data) => {
            //res.json(data);

            const text = JSON.stringify(data, null, 4);
            res.setHeader('Content-type', "application/octet-stream");
            res.setHeader('Content-disposition', 'attachment; filename='+ocid+'.json');

            res.send(text);
        });

    });
});

router.get('/top/:n/buyers', (req, res)=> {

    let {n} = req.params;
    const {supplier_id} = req.query;

    if (isNaN(n)){
        n = 10;
    } else {
        n = Math.abs(n);
    }

    if (n > 200){
        n = 10;
    }

    let supplier = suppliers[0];
    if (typeof supplier_id !== "undefined" && supplier_id !== null){
        supplier = suppliers.find(s => s.id === supplier_id);
    }
    const {collections} = supplier;

    MongoClient.connect(dbConfig.url, dbConfig.client_options).then( client => {
        const db = client.db(dbConfig.dbname);

        db.collection(collections.agg_contracts_buyer).find({}, {limit: n}).sort({total: -1}).toArray((error, data)=> {
            res.json(data);
        });
    });
});


router.get('/top/:n/suppliers', (req, res)=> {

    let {n} = req.params;
    const {supplier_id} = req.query;

    if (isNaN(n)){
        n = 10;
    } else {
        n = Math.abs(n);
    }

    //console.log(n);

    if (n > 200){
        n = 10;
    }

    let supplier = suppliers[0];
    if (typeof supplier_id !== "undefined" && supplier_id !== null){
        supplier = suppliers.find(s => s.id === supplier_id);
    }
    const {collections} = supplier;

    MongoClient.connect(dbConfig.url, dbConfig.client_options).then( client => {
        const db = client.db(dbConfig.dbname); //

        db.collection(collections.agg_awards_suppliers).find({}, {limit: n}).sort({"data.total": -1}).toArray((error, data)=> {
            res.json(data);
        });
    });
});


router.get('/cycles', (req, res) => {

    const {supplier_id} = req.query;
    let supplier = suppliers[0];

    if (typeof supplier_id !== "undefined" && supplier_id !== null){
        supplier = suppliers.find(s => s.id === supplier_id);
    }

    const {collections} = supplier;

    MongoClient.connect(dbConfig.url, dbConfig.client_options).then( client => {

        const db = client.db(dbConfig.dbname); //

        db.collection(collections.releases).distinct('cycle').then( data => {
            res.json(data.sort().reverse());
        });
    });
});

/*
router.get('/records/:ocid', (req, res) => {

    const ocid = req.params.ocid;

    MongoClient.connect(dbConfig.url, {
        useNewUrlParser: true
    }).then(client => {

        const db = client.db(dbConfig.dbname);

        db.collection('edca_records').find({"records.ocid": ocid}).toArray((error, data) => {
            //res.json(data)

            const text=JSON.stringify(data, null, 4);
            res.setHeader('Content-type', "application/octet-stream");
            res.setHeader('Content-disposition', 'attachment; filename='+ocid+'.json');

            res.send(text);
        });
    })
});*/

module.exports = router;
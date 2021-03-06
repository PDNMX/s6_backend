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
    const apf = suppliers[0];
    const {collections} = apf;

    MongoClient.connect(dbConfig.url, dbConfig.client_options).then(client => {
        let db = client.db(dbConfig.dbname); //
        //console.log(collections)

        let releases = db.collection(collections.releases);
        let buyers = db.collection(collections.buyers);
        let totalAmount = db.collection(collections.agg_contracts_total);
        let contracts_amounts = db.collection(collections.agg_contracts_procurement_method);

        let queries  = [
            releases.countDocuments(),
            buyers.countDocuments(),
            // simplify to one query => filter
            releases.countDocuments({"tender.procurementMethod": { $regex: "open", $options: "i"}}),
            releases.countDocuments({"tender.procurementMethod": { $regex: "selective", $options: "i"}}),
            releases.countDocuments({"tender.procurementMethod": { $regex: "direct", $options: "i"}}),
            totalAmount.findOne(),
            // simplify: one query => filter
            contracts_amounts.findOne({'_id': 'open'}),
            contracts_amounts.findOne({'_id': 'selective'}),
            contracts_amounts.findOne({'_id': 'direct'}),
            contracts_amounts.findOne({'_id': null}),
        ];

        Promise.all(queries).then( d => {
            //console.log(d);
            res.json({
                procedimientos: d[0],
                instituciones: d[1],
                counts: {
                    open: d[2],
                    selective: d[3],
                    direct: d[4],
                    other: (d[0] - (d[2] + d[3] + d[4])),
                },
                amounts: {
                    total: d[5].total,
                    open: d[6].total,
                    selective: d[7].total,
                    direct: d[8].total,
                    other: d[9].total
                }
            })
        });

    }).catch(error => {
        console.log(error)
    })

});

router.get('/buyers', (req,res) => {

    const apf = suppliers[0];
    const {collections} = apf;

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
    console.log(req.body);

    //get supplier.id from query
    const apf = suppliers[0];
    const {collections} = apf;

    let pageSize = req.body.pageSize || MAX_RESULTS;
    let page = req.body.page || 0;
    let {contract_title,
        ocid,
        buyer_id,
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

        if (typeof buyer_id !== 'undefined'){
            query["buyer.id"] = buyer_id ;
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
        };


        collection.countDocuments(query).then ( count => {
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

    const ocid = req.params.ocid;

    const apf = suppliers[0];
    const {collections} = apf;

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

    if (isNaN(n)){
        n = 10;
    } else {
        n = Math.abs(n);
    }

    if (n > 200){
        n = 10;
    }

    const apf = suppliers[0];
    const {collections} = apf;

    MongoClient.connect(dbConfig.url, dbConfig.client_options).then( client => {
        const db = client.db(dbConfig.dbname);

        db.collection(collections.agg_contracts_buyer).find({}, {limit: n}).sort({total: -1}).toArray((error, data)=> {
            res.json(data);
        });
    });
});


router.get('/top/:n/suppliers', (req, res)=> {

    let {n} = req.params;

    if (isNaN(n)){
        n = 10;
    } else {
        n = Math.abs(n);
    }

    //console.log(n);

    if (n > 200){
        n = 10;
    }

    const apf = suppliers[0];
    const {collections} = apf;

    MongoClient.connect(dbConfig.url, dbConfig.client_options).then( client => {
        const db = client.db(dbConfig.dbname); //

        db.collection(collections.agg_awards_suppliers).find({}, {limit: n}).sort({"data.total": -1}).toArray((error, data)=> {
            res.json(data);
        });
    });
});


router.get('/cycles', (req, res) => {

    const apf = suppliers[0];
    const {collections} = apf;

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
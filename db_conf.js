const host = process.env.MONGODB_HOST || 'localhost';
const port = process.env.MONGODB_PORT || 27017;
const user = process.env.MONGODB_USER;
const password = process.env.MONGODB_PASSWORD;
const dbName = process.env.MONGODB_DBNAME || 'contrataciones';

let credentials = '';

if (typeof user !== 'undefined' && user !== '') {
    credentials = `${user}:${password}@`;
}
const url = `mongodb://${credentials}${host}:${port}/${dbName}`;

const client_options = {
    useUnifiedTopology: true,
    useNewUrlParser: true
};

module.exports = {
    url,
    client_options,
    dbName
};
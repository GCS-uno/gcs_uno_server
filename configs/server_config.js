
module.exports = {

     UI_SERVER_HOST: '0.0.0.0' // change to 127.0.0.1 if you use Nginx
    ,UI_SERVER_PORT: 8080

    ,DJI_SERVER_HOST: '0.0.0.0' // change to 127.0.0.1 if you use Nginx
    ,DJI_SERVER_PORT: 8099
    ,DJI_KEYS: ['abcd1234', 'abcd6789']  // List of allowed keys to connect with mobile app

    ,REDIS_HOST: 'localhost'
    ,REDIS_PORT: 6379

    ,RETHINKDB_SERVER: 'localhost'
    ,RETHINKDB_PORT: 28015
    ,RETHINKDB_DB: 'gcs1'

    ,GMAPS_API_KEY: 'AIzaSyCPQiIQGU3fHPVGEVHbUw1Md7qiT18cqV4' // Your Google Maps API key

};

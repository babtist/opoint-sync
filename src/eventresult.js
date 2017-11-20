const Datastore = require('@google-cloud/datastore');
const datastore = Datastore();
const Person = require('./person');

let EventResult = function() {
    this.data = {races: {}};
};



EventResult.prototype.get = function (name) {
    return this.data[name];
};

EventResult.prototype.set = function (name, value) {
    if (value) {
        this.data[name] = value;
    }
    return this;
};

EventResult.prototype.upsert = function () {
    let self = this;
    return new Promise(function(resolve, reject) {
        datastore.upsert({key: datastore.key(['Person', self.data['person'].get('id'), 'EventResult']), data: self.toDatastore()})
            .then(() => {
                resolve();
            })
            .catch((err) => {
                reject(err);
            });
    });
};

EventResult.upsertBatch = function(eventResults) {
    return new Promise(function(resolve, reject) {
        datastore.upsert(eventResults.map(res => {
            return {
                key: datastore.key(['Person', res.data['person'].get('id'), 'EventResult']),
                data: res.toDatastore()
            };
        }))
            .then(() => {
                resolve();
            })
            .catch((err) => {
                reject(err);
            });
    });
};


EventResult.prototype.toDatastore = function() {
    let convertedRaces = Object.keys(this.get('races')).map(r => {
        return {[r]: this.get('races')[r]['data']}
    });

    let person =  this.get('person');
    let event = this.get('event');

    return [
        {
            name: 'person',
            value: person['data']
        },
        {
            name: 'event',
            value: event['data']
        },
        {   name: 'races',
            value: convertedRaces
        }
    ];

};

EventResult.findByPerson = function(personId) {
    const ancestorKey = datastore.key(['Person', personId]);
    const query = datastore.createQuery('EventResult').hasAncestor(ancestorKey);
    return new Promise(function(resolve, reject) {
        datastore.runQuery(query)
            .then((results) => {
                //  entities found.
                const entities = results[0];
                resolve(entities);
            })
            .catch((err) => reject(err));
    });
};

module.exports = EventResult;
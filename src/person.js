const Datastore = require('@google-cloud/datastore');
const datastore = Datastore();

let Person = function() {
    this.data = {};
};

Person.prototype.get = function (name) {
    return this.data[name];
};

Person.prototype.set = function (name, value) {
    if (value) {
        this.data[name] = value;
    }
    return this;
};

Person.prototype.upsert = function () {
    let self = this;
    return new Promise(function(resolve, reject) {
        datastore.upsert({key: datastore.key(['Person', self.get('id')]), data: self.toDatastore()})
            .then(() => {
                resolve();
            })
            .catch((err) => {
                reject(err);
            });
    });
};

Person.upsertBatch = function(persons) {
    return new Promise(function(resolve, reject) {
        datastore.upsert(persons.map(res => {
            return {key: datastore.key(['Person', res.get('id')]), data: res.toDatastore()};
        }))
            .then(() => {
                resolve();
            })
            .catch((err) => {
                reject(err);
            });
    });
};


Person.prototype.toDatastore = function() {
    return [
        {
            name: 'id',
            value: this.get('id')
        },
        {
            name: 'name',
            value: this.get('name')
        }
    ];

};

module.exports = Person;


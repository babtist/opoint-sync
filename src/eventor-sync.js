const EventorApi = require('eventor-api');
const Person = require('./person');

function EventorSync(options) {
    this.eventorApi = new EventorApi({
        eventorApiUrl: 'http://eventor-sweden-test.orientering.se/api/',
        apiKey: options.apiKey
    });
}

EventorSync.prototype.syncPersons = function(organisationId) {
    let self = this;
    return new Promise(function(resolve, reject) {
        self.eventorApi.persons(organisationId)
            .then(persons => {
                Person.upsertBatch(persons.map(p => {
                        return new Person().set('id', p.personId).set('name', p.personName.given + ' ' + p.personName.family);
                    }))
                    .then(() => resolve())
                    .catch(e => reject(e));
            })
            .catch(e => reject(e));
    });
};

module.exports = EventorSync;


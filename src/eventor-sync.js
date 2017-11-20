const EventorApi = require('eventor-api');
const Person = require('./person');
const EventInfo = require('./eventinfo');
const Race = require('./race');
const EventResult = require('./eventresult');


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

EventorSync.prototype.syncEvents = function(organisationId, fromDate, toDate) {
    let self = this;
    return new Promise(function(resolve, reject) {
        self.eventorApi.events({fromDate: fromDate, toDate: toDate})
            .then(events => findEventsWithCompetitors(self.eventorApi, organisationId, events)
                .then(events => getResults(self.eventorApi, organisationId, events)
                    .then(results => {
                        // console.log(results);
                        let eventResults = parseResults(results);
                        let remainingEventIds = getRemainingEventIds(events.map(e => e.eventId), results.map(r => r.event.eventId));
                        events = events.filter(e => remainingEventIds.indexOf(e.eventId) > -1);
                        getStarts(self.eventorApi, organisationId, events)
                            .then(starts => {
                                parseStarts(eventResults, starts);
                                remainingEventIds = getRemainingEventIds(remainingEventIds, starts.map(r => r.event.eventId));
                                getEntries(self.eventorApi, organisationId, remainingEventIds)
                                    .then(entries => {
                                        let promises = [];
                                        let classMap = new Map();
                                        remainingEventIds.forEach(e => {
                                            promises.push(self.eventorApi.eventClasses(e)
                                                .then(eventClasses => {
                                                    eventClasses.forEach(c => classMap.set(c.eventClassId, c));
                                                }));
                                        });
                                        Promise.all(promises).then(() => {
                                            parseEntries(eventResults, classMap, entries);
                                            let eventResultArray = [];


                                            Object.keys(eventResults).forEach(personId => {
                                                Object.keys(eventResults[personId]).forEach(eventId => {
                                                    eventResultArray.push(eventResults[personId][eventId]);
                                                })
                                            });

                                            console.log('Processed ' + eventResultArray.length + ' results');
                                            /*
                                            EventResult.upsertBatch(eventResultArray)
                                                .then(() => resolve())
                                                .catch(e => reject(e));
                                                */
                                        }).catch(e => reject(e));
                                    })
                                    .catch(e => reject(e));
                            })
                            .catch(e => reject(e));
                    })
                    .catch(e => reject(e)))
                .catch(e => reject(e)))
            .catch(e => reject(e));
    });
};

findEventsWithCompetitors = function(eventorApi, organisationId, events) {
    return new Promise(function (resolve, reject) {

        let eventIds = events.reduce((array, e) => {array.push(e.eventId); return array}, []);
        eventorApi.competitorCount([organisationId], eventIds)
            .then((ccList) => {

                ccList = ccList.filter(cc => cc.organisationCompetitorCount);
                let ccEventIds = ccList.reduce((array, cc) => {array.push(cc.eventId); return array}, []);
                resolve(events.filter(e => ccEventIds.indexOf(e.eventId) !== -1));


            })
            .catch((err) => reject(err));
    });
};

getResults = function(eventorApi, organisationId, events) {
    let promises = [];
    return new Promise(function (resolve, reject) {
        let results = [];
        events.forEach(e => promises.push(eventorApi.results(organisationId, e.eventId).then((classResult) => {
            results = results.concat(classResult.map(cr => { return {event: e, classResult: cr}}));
        })));
        Promise.all(promises)
            .then(() => resolve(results))
            .catch(err => reject(err));
    });
};

/**
 *
 * @param results Array of Eventor ClassResult
 */
parseResults = function(results) {
    let eventResults = {};
    results.forEach(res => {
        let event = res.event;
        let classResult = res.classResult;
        let eventClass = classResult.eventClass;

        let result = [];
        if (classResult.personResult) {
            result = classResult.personResult;
        } else if (classResult.teamResult) {
            if (Array.isArray(classResult.teamResult)) {
                classResult.teamResult.forEach(tr => {
                    if (tr.teamMemberResult) {
                        if (Array.isArray(tr.teamMemberResult)) {
                            tr.teamMemberResult.forEach(tmr => result.push(tmr));
                        } else {
                            result.push(tr.teamMemberResult);
                        }
                    }
                });
            } else {
                if (classResult.teamResult.teamMemberResult) {
                    if (Array.isArray(classResult.teamResult.teamMemberResult)) {
                        classResult.teamResult.teamMemberResult.forEach(tmr => result.push(tmr));
                    } else {
                        result.push(classResult.teamResult.teamMemberResult);
                    }
                }
            }
        }
        if (!Array.isArray(result)) {
            result = [result];
        }

        result.forEach(r => {
            // console.log(event);
            if (!r.person || !r.person.personId) {
                return;
            }
            let person = new Person(r.person.personId['_'],
                r.person.personName.given['_'] + ' ' + r.person.personName.family);
            let eventInfo = new EventInfo()
                .set('eventForm', event.eventForm)
                .set('eventId', event.eventId)
                .set('eventName', event.name['_'])
                .set('eventClassId', eventClass.eventClassId)
                .set('eventClassName', eventClass.name['_'])
                .set('classTypeId', eventClass.classTypeId)
                .set('eventDate', event.startDate)
                .set('disciplineId', event.disciplineId)
                .set('eventClassificationId', event.eventClassificationId);
            let race = new Race();


            let result;
            let classRaceInfo;
            let isRelay = false;
            if (r.raceResult) {
                let raceResult = r.raceResult;
                let eventRace = raceResult.eventRace;
                race.set('raceDistance', eventRace.raceDistance);
                race.set('raceLightCondition', eventRace.raceLightCondition);
                race.set('raceDistance', eventRace.raceDistance);
                race.set('raceName', eventRace.name['_']);
                race.set('raceDate', eventRace.raceDate);
                classRaceInfo = eventClass.classRaceInfo.find(c => c.eventRaceId === eventRace.eventRaceId);
                result = raceResult.result;
            } else {
                if (r.result) {
                    // Individual race
                    result = r.result;
                    classRaceInfo = eventClass.classRaceInfo;
                } else {
                    // Relay
                    result = r;
                    isRelay = true;
                    classRaceInfo = eventClass.classRaceInfo;
                    if (Array.isArray(classRaceInfo)) {
                        console.log('leg', result.leg);
                        classRaceInfo = classRaceInfo.find(c => {console.log('relayLeg', c.relayLeg); return c.relayLeg === result.leg});
                    } else {
                        console.log('not array', classRaceInfo);
                    }
                }


            }

            race.set('startTime', result.startTime);
            race.set('finishTime', result.finishTime);
            race.set('time', result.time);
            race.set('competitorStatus', result.competitorStatus['value']);
            race.set('cCardId', result.cCardId);

            if (!isRelay) {
                race.set('resultId', result.resultId);
                race.set('timeDiff', result.timeDiff);
                race.set('resultPosition', result.resultPosition);
            } else {
                race.set('leg', result.leg);
                console.log('raceIndo', classRaceInfo);
            }


            race.set('noOfStarts', classRaceInfo.noOfStarts);
            race.set('eventRaceId', classRaceInfo.eventRaceId);


            let personEventResult = eventResults[person.get('id')];
            let eventResult;
            if (!personEventResult) {
                let personEventResult = {};
                eventResult = new EventResult();
                personEventResult[eventInfo.get('eventId')] = eventResult;
                eventResults[person.get('id')] = personEventResult;
            } else {
                eventResult = personEventResult[eventInfo.get('eventId')];
                if (!eventResult) {
                    eventResult = new EventResult();
                    personEventResult[eventInfo.get('eventId')] = eventResult;
                }
            }
            eventResult.get('races')[race.get('eventRaceId')] = race;
            eventResult.set('person', person);
            eventResult.set('event', eventInfo);

        });


    });
    return eventResults;

};

getStarts = function(eventorApi, organisationId, events) {
    let promises = [];
    return new Promise(function (resolve, reject) {
        let starts = [];
        events.forEach(e => promises.push(eventorApi.starts(organisationId, e.eventId).then((classStart) => {
            starts = starts.concat(classStart.map(cs => { return {event: e, classStart: cs}}));
        })));
        Promise.all(promises)
            .then(() => resolve(starts))
            .catch(err => reject(err));
    });
};

parseStarts = function(eventResults, startList) {
    startList.forEach(res => {
        let event = res.event;
        let classStart = res.classStart;
        let eventClass = classStart.eventClass;


        let personStart = classStart.personStart;
        if (!Array.isArray(personStart)) {
            personStart = [personStart];
        }
        personStart.forEach(ps => {
            if (!ps.person || !ps.person.personId) {
                return;
            }
            let person = new Person(pr.person.personId['_'],
                pr.person.personName.given['_'] + ' ' + pr.person.personName.family);
            let personId = ps.person.personId['_'];
            let personEventResult = eventResults[personId];
            if (!personEventResult) {
                personEventResult = {};
                eventResults[personId] = personEventResult;
            }
            let eventResult = personEventResult[event.eventId];
            if (!eventResult) {
                eventResult = new EventResult();
                personEventResult[event.eventId] = eventResult;
            }


            let start;
            let classRaceInfo;
            let eventRace;
            if (ps.raceStart) {
                let raceStart = ps.raceStart;
                if (!Array.isArray(raceStart)) {
                    raceStart = [raceStart];
                }

                raceStart.forEach(rs => {
                    classRaceInfo = eventClass.classRaceInfo.find(c => c.eventRaceId === rs.eventRace.eventRaceId);
                    start = rs.start;

                    addStartInfo(eventResult, event, eventClass, person, start, classRaceInfo, rs.eventRace);
                });
            } else {
                start = ps.start;
                classRaceInfo = eventClass.classRaceInfo;
                addStartInfo(eventResult, event, eventClass, person, start, classRaceInfo, null);
            }


        });


    });

};

addStartInfo = function(eventResult, event, eventClass, person, start, classRaceInfo, eventRace) {
    let race = eventResult.get('races')[classRaceInfo.eventRaceId];
    if (!race) {
        race = new Race();
        eventResult.get('races')[classRaceInfo.eventRaceId] = race;
    }

    let eventInfo = new EventInfo()
        .set('eventForm', event.eventForm)
        .set('eventId', event.eventId)
        .set('eventName', event.name['_'])
        .set('eventClassId', eventClass.eventClassId)
        .set('eventClassName', eventClass.eventClassName)
        .set('classTypeId', eventClass.classTypeId)
        .set('eventDate', eventClass.eventDate)
        .set('disciplineId', event.disciplineId)
        .set('eventClassificationId', event.eventClassificationId);
    eventResult.set('event', eventInfo);
    eventResult.set('person', person);
    if (eventRace) {
        race.set('raceDistance', eventRace.raceDistance);
        race.set('raceLightCondition', eventRace.raceLightCondition);
        race.set('raceDistance', eventRace.raceDistance);
        race.set('raceName', eventRace.name['_']);
        race.set('raceDate', eventRace.raceDate);
    }

    race.set('startId', start.startId);
    race.set('startTime', start.startTime);
    race.set('cCardId', start.cCardId);

    race.set('noOfStarts', classRaceInfo.noOfStarts);
    race.set('eventRaceId', classRaceInfo.eventRaceId);
};

getEntries = function(eventorApi, organisationId, events) {
    return new Promise(function (resolve, reject) {
        let qs = {
            organisationIds: organisationId,
            eventIds: events.join(','),
            includeEventElement: true,
            includePersonElement: true
        };

        eventorApi.entries(qs).then((entries) => {
            resolve(entries);
        }).catch(e => reject(e));


    });
};

parseEntries = function(eventResults, classMap, entries) {
    if (!Array.isArray(entries)) {
        entries = [entries];
    }
    entries.forEach(entry => {
        let event = entry.event;
        console.log(entry);
        if (!entry.competitor.person || !entry.competitor.person.personId) {
            return;
        }
        let personId = entry.competitor.person.personId['_'];
        let personEventResult = eventResults[personId];
        if (!personEventResult) {
            personEventResult = {};
            eventResults[personId] = personEventResult;
        }
        let eventResult = personEventResult[event.eventId];
        if (!eventResult) {
            eventResult = new EventResult();
            personEventResult[event.eventId] = eventResult;
            let person = new Person(entry.competitor.person.personId['_'],
                entry.competitor.person.personName.given['_'] + ' ' + entry.competitor.person.personName.family);
            let eventInfo = new EventInfo()
                .set('eventForm', event.eventForm)
                .set('eventId', event.eventId)
                .set('eventName', event.name['_'])
                .set('eventStatusId', event.eventStatusId)
                .set('eventClassId', entry.entryClass.eventClassId)
                .set('eventClassName', classMap.get(entry.entryClass.eventClassId)['name'])
                .set('eventDate', event.startDate)
                .set('disciplineId', event.disciplineId)
                .set('eventClassificationId', event.eventClassificationId);
            let race = new Race()
                .set('eventRaceId', event.eventRace.eventRaceId)
                .set('raceDistance', event.eventRace.raceDistance)
                .set('raceLightCondition', event.eventRace.raceLightCondition);
            eventResult.set('event', eventInfo);
            eventResult.set('person', person);
            eventResult.get('races')[race.get('eventRaceId')] =  race;
        }

    });
};

/**
 * Remove the event ids in processedEventIds from eventIds
 * @param eventIds an array of event ids
 * @param processedEventIds an array of event ids that have been processed and shall be removed
 */
getRemainingEventIds = function(eventIds, processedEventIds) {
    processedEventIds.forEach(pe => {
        let index = eventIds.indexOf(pe);
        if (index > -1) {
            eventIds.splice(index,1);
        }
    });
    return eventIds;
};

module.exports = EventorSync;



let EventInfo = function() {
    this.data = {};
};

EventInfo.prototype.get = function (name) {
    return this.data[name];
};

EventInfo.prototype.set = function (name, value) {
    if (value) {
        this.data[name] = value;
    }
    return this;
};


EventInfo.prototype.toDatastore = function() {
    return Object.keys(this.data).map(k => {
        return {k: this.get(k)}
    })
};

module.exports = EventInfo;
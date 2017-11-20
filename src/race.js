
let Race = function() {
    this.data = {};
};

Race.prototype.get = function (name) {
    return this.data[name];
};

Race.prototype.set = function (name, value) {
    this.data[name] = value;
    return this;
};


Race.prototype.toDatastore = function() {
    return Object.keys(this.data).map(k => {
        return {k: this.get(k)}
    })
};

module.exports = Race;
const addon = require('bindings')('addon_twisted.node')

console.log('This should be eight:', addon.add(3, 5))

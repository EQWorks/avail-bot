const asana = require('asana')

const { ASANA_TOKEN } = process.env

module.exports = asana.Client.create({
  defaultHeaders: {'asana-enable': 'string_ids,new_sections'},
}).useAccessToken(ASANA_TOKEN || '0/d3242d7c3f4f24f13610d7a861b8c0ec')

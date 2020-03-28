const asana = require('asana')


const { ASANA_TOKEN } = process.env

module.exports = asana.Client
  .create({ defaultHeaders: { 'asana-enable': 'string_ids,new_sections' } })
  .useAccessToken(ASANA_TOKEN)

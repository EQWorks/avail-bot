const asana = require('asana')


const { ASANA_TOKEN = '1/1155496082792259:3aaae636f72dd85ac755e149d627dcdf' } = process.env

module.exports = asana.Client
  .create({ defaultHeaders: { 'asana-enable': 'string_ids,new_sections' } })
  .useAccessToken(ASANA_TOKEN)

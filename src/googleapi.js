const { google } = require('googleapis')


// NOTE: current access scopes are read-only
// const scopes = [
//   'https://www.googleapis.com/auth/calendar.readonly',
//   'https://www.googleapis.com/auth/calendar.events.readonly'
// ]

const {
  AVAIL_CALENDAR,
  CLIENT_ID,
  CLIENT_SECRET,
  REFRESH_TOKEN,
} = process.env

const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET)
oAuth2Client.setCredentials({ refresh_token: REFRESH_TOKEN })
const calendar = google.calendar({ version: 'v3', auth: oAuth2Client })

const today = new Date()
const _getDayOfWeek = (day) => (date) => {
  const today = new Date(date)   
  return new Date(today.setDate(today.getDate() - today.getDay() + day))
}
const getMonday = _getDayOfWeek(1)
const getFriday = _getDayOfWeek(5)

const AVAILS = ['vacation', 'appointment', 'not avail', 'ooo']

const getWeeklyAvails = () => calendar.events
  .list({
    calendarId: AVAIL_CALENDAR,
    timeMin: getMonday(today),
    timeMax: getFriday(today),
    singleEvents: true,
  }).then(({ data: { items } }) => {
    if (items.length) return groupByName(items)
    return {}
  })
  .catch((e) => console.error('Failed to fetch weekly events: ', e))

const formatAvailDates = (availDate, avail) => {
  const dateTime = new Date(availDate)
    .toLocaleString('en-CA', { timeZone: 'EST',  dateStyle: 'short', timeStyle: 'short'  })
  const [date] = dateTime.split(', ')

  if (['vacation'].includes(avail.toLowerCase())) return date
  return dateTime
}

const groupByName = (avails) => avails
  .reduce((acc, { creator: { email }, start: _start, end: _end, summary, sequence }) => {
    let [avail, name] = summary.split(':')
    avail = avail.toLowerCase().trim()
    name = name.toLowerCase().trim()

    const start = formatAvailDates(_start.dateTime || _start.date, avail)
    const end = formatAvailDates(_end.dateTime || _end.date, avail)

    if (AVAILS.includes(avail)) {
      if (acc[name]) {
        acc[name] = {
          ...acc[name],
          [avail]: [ ...(acc[name][avail] || []), { start, end, sequence } ],
        }
      } else {
        acc[name] = { email, [avail]: [{ start, end, sequence }] }
      }
    }
    return acc
  }, {})

const formatDateTime = (av, { start, end, sequence }) => {
  if (av === 'vacation') {
    return sequence ? `${start} to ${end}` : end
  }

  const [startDate, startTime] = start.split(', ')
  const [endDate, endTime] = end.split(', ')

  if (startDate === endDate) return `${endDate}, ${startTime} - ${endTime}`
  return `${start} - ${end}`
}

const formatWeeklyAvails = async () => {
  const avails = await getWeeklyAvails()
  return Object.entries(avails)
    .reduce((acc, [name, av]) => {
      AVAILS.forEach((availType) => {
        if (av[availType]) {
          acc[availType] = [
            ...(acc[availType] || []),
            { [name]: av[availType].map((apt) => formatDateTime(availType, apt)) },
          ]
        }
      })
      return acc
    }, {})
}

module.exports = { getWeeklyAvails, formatWeeklyAvails }

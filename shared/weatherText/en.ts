// Weather and advice words, shared by the app (spread into src/i18n) and the Worker (morning alerts,
// answers when the AI is resting). One file per language so the app only loads the farmer's.
export const weatherEn = {
  'weather.today': 'Today',
  'weather.tomorrow': 'Tomorrow',
  'weather.kind.clear': 'Clear sky',
  'weather.kind.partly': 'Partly cloudy',
  'weather.kind.cloudy': 'Cloudy',
  'weather.kind.fog': 'Fog',
  'weather.kind.lightrain': 'Light rain',
  'weather.kind.rain': 'Rain',
  'weather.kind.heavyrain': 'Heavy rain',
  'weather.kind.thunder': 'Thunderstorm',
  'weather.kind.snow': 'Snow',
  'advice.sprayGood': 'If you need to spray, the best time is {window}.',
  'advice.sprayRain': 'Do not spray now: rain is expected in the next few hours and will wash it off.',
  'advice.sprayWind': 'Too windy to spray ({wind} km/h). The spray will drift and be wasted.',
  'advice.noSprayWindow': 'No good time to spray in the next 24 hours.',
  'advice.heavyRain': 'Heavy rain expected {day}. Clear field drains and delay fertilizer.',
  'advice.heatSafety':
    'Very hot days ahead! Avoid field work from 12 to 3 pm, drink water often and rest in the shade. Dizziness, confusion or no sweating: call 108 at once.',
  'advice.rainSoon': 'Rain expected {day}. You can hold off irrigation and fertilizer top-dressing.',
  'advice.heat': 'Hot days ahead (up to {temp}°C). Irrigate in the morning or evening and mulch to save moisture.',
  'advice.dryWeek': 'No rain expected this week. Plan your irrigation.',
  'advice.humid': 'Humid, wet weather raises the risk of fungal disease. Check leaves for spots.',
  'advice.thunder': 'Thunderstorms possible {day}. During lightning, stay away from open fields and tall trees.',
  'advice.strongWind': 'Strong wind possible {day} (up to {wind} km/h). Do not spray; support tall crops like banana and sugarcane, and tie down loose roofs.',
  'forecast.place': 'Weather for {place}',
  'forecast.placeApprox': 'Weather for {place} (approximate)',
  'forecast.day': '{day}: {sky}, {min}–{max}°C, rain {rain} mm.',
  'forecast.more': 'Open the Weather tab for the hour-by-hour forecast.',
  'alerts.official': 'Official warning ({office})',
  'push.title': '{place}: {min}–{max}°C, {sky}',
}

export type WeatherTextKey = keyof typeof weatherEn
export type WeatherText = Record<WeatherTextKey, string>

import { describe, expect, test } from 'vitest'
import { alertView, alertsFor, insideRing, parseCap, parseFeed, parseRings } from './sachet'

// Trimmed from real SACHET files (13 Oct 2026).
const FEED = `<rss version="2.0"><channel><title>All India: CAP Disaster Alert Feeds</title>
<item><title>మీ ప్రాంతంలో పిడుగులు పడే అవకాశం ఉంది.</title><description/><category>Met</category>
<link>https://sachet.ndma.gov.in/cap_public_website/FetchXMLFile?identifier=1791849173036008</link>
<author>controlroom@ndma.gov.in (Andhra Pradesh SDMA)</author><guid isPermaLink="false">1791849173036008</guid>
<pubDate>Mon, 12 Oct 2026 23:53:27 GMT</pubDate></item>
<item><title>Moderate Rain</title><description/><category>Met</category>
<author>controlroom@ndma.gov.in (IMD Chennai)</author><guid isPermaLink="false">1791833229397007</guid>
<pubDate>Mon, 12 Oct 2026 19:26:34 GMT</pubDate></item>
<item><title>Flood</title><category>Hydro</category><author>controlroom@ndma.gov.in (CWC)</author><guid>1791831570792016</guid></item>
</channel></rss>`

const IMD_CHENNAI = `<cap:alert xmlns:cap="urn:oasis:names:tc:emergency:cap:1.2">
<cap:identifier>IN-1791833229397007_43</cap:identifier><cap:sender>IMD-Chennai</cap:sender>
<cap:info><cap:language>en-IN</cap:language><cap:category>Met</cap:category><cap:event>Moderate Rain</cap:event>
<cap:urgency>Expected</cap:urgency><cap:severity>Moderate</cap:severity><cap:certainty>Possible</cap:certainty>
<cap:onset>2026-10-13T00:57:09+05:30</cap:onset><cap:expires>2026-10-13T03:55:00+05:30</cap:expires>
<cap:headline>Moderate Rain with thunderstorm and lighting  is likely to occur at most places over Kanniyakumari, Sivaganga, Tenkasi, Thoothukkudi, Tirunelveli and Virudhunagar in next 3 hours.</cap:headline>
<cap:parameter><cap:valueName>Polygon URL</cap:valueName><cap:value>https://sachet.ndma.gov.in/cap_public_website/FetchPolygonXMLFile?identifier=1791833229397007</cap:value></cap:parameter>
<cap:area><cap:areaDesc>Kanniyakumari, Sivaganga, Tenkasi, Thoothukkudi, Tirunelveli, Virudhunagar districts of Tamil Nadu</cap:areaDesc>
<cap:geocode><cap:valueName>LGD District Code</cap:valueName><cap:value>575</cap:value></cap:geocode>
<cap:geocode><cap:valueName>LGD District Code</cap:valueName><cap:value>733</cap:value></cap:geocode>
<cap:geocode><cap:valueName>LGD District Code</cap:valueName><cap:value>594</cap:value></cap:geocode>
</cap:area></cap:info></cap:alert>`

const AP_LIGHTNING = `<cap:alert xmlns:cap="urn:oasis:names:tc:emergency:cap:1.2">
<cap:info><cap:language>en-IN</cap:language><cap:category>Met</cap:category><cap:event>Lightning</cap:event>
<cap:urgency>Expected</cap:urgency><cap:severity>Severe</cap:severity><cap:certainty>Possible</cap:certainty>
<cap:expires>2026-10-13T07:20:00+05:30</cap:expires>
<cap:headline>There is a possibility of lightning in your area. Seek shelter in safe buildings - Andhra Pradesh Government.</cap:headline>
<cap:parameter><cap:valueName>Polygon URL</cap:valueName><cap:value>https://sachet.ndma.gov.in/cap_public_website/FetchPolygonXMLFile?identifier=1791849173036008</cap:value></cap:parameter>
<cap:area><cap:areaDesc>krs-nagayalanka Mandal </cap:areaDesc></cap:area></cap:info>
<cap:info><cap:language>TL</cap:language><cap:category>Met</cap:category><cap:event>Lightning</cap:event>
<cap:expires>2026-10-13T07:20:00+05:30</cap:expires>
<cap:headline>మీ ప్రాంతంలో పిడుగులు పడే అవకాశం ఉంది. సురక్షితమైన భవనాల్లో ఆశ్రయం పొందండి-ఆంధ్రప్రదేశ్ ప్రభుత్వం.</cap:headline>
<cap:area><cap:areaDesc>krs-nagayalanka Mandal </cap:areaDesc></cap:area></cap:info></cap:alert>`

const OUTLINE = `<alert><identifier>IN-1791849173036008_8</identifier>
<polygon>15.90,80.90 15.90,81.00 16.00,81.00 16.00,80.90 15.90,80.90</polygon></alert>`

const BEFORE_EXPIRY = Date.parse('2026-10-13T01:00:00+05:30')

describe('SACHET feed', () => {
  test('reads items with their issuing office, Met only', () => {
    expect(parseFeed(FEED)).toEqual([
      { id: '1791849173036008', office: 'Andhra Pradesh SDMA', pubDate: Date.parse('Mon, 12 Oct 2026 23:53:27 GMT') },
      { id: '1791833229397007', office: 'IMD Chennai', pubDate: Date.parse('Mon, 12 Oct 2026 19:26:34 GMT') },
    ])
  })

  test('a district warning keeps its LGD codes and needs no outline', () => {
    const a = parseCap(IMD_CHENNAI, '1791833229397007', 'IMD Chennai')!
    expect(a).toMatchObject({ event: 'Moderate Rain', severity: 'Moderate', lgd: [575, 733, 594], expires: '2026-10-12T22:25:00.000Z' })
    expect(a.ringsUrl).toBeUndefined()
    expect(a.headlines.en).toMatch(/^Moderate Rain/)
  })

  test('a mandal warning keeps every language and asks for its outline', () => {
    const a = parseCap(AP_LIGHTNING, '1791849173036008', 'Andhra Pradesh SDMA')!
    expect(a.lgd).toEqual([])
    expect(a.ringsUrl).toBe('https://sachet.ndma.gov.in/cap_public_website/FetchPolygonXMLFile?identifier=1791849173036008')
    expect(a.headlines.te).toMatch(/^మీ ప్రాంతంలో/)
    expect(alertView(a, 'te')).toMatchObject({ headlineLang: 'te', severity: 'Severe' })
    expect(alertView(a, 'kn')).toMatchObject({ headlineLang: 'en' })
  })

  test('never follows an outline link off SACHET', () => {
    const a = parseCap(AP_LIGHTNING.replace(/https:\/\/sachet\.ndma\.gov\.in/g, 'https://evil.example'), '1', 'Andhra Pradesh SDMA')!
    expect(a.ringsUrl).toBeUndefined()
  })
})

describe('matching a farmer', () => {
  const district = parseCap(IMD_CHENNAI, '1', 'IMD Chennai')!
  const { ringsUrl: _, ...mandal } = { ...parseCap(AP_LIGHTNING, '2', 'Andhra Pradesh SDMA')!, rings: parseRings(OUTLINE) }

  test('outline point-in-polygon', () => {
    expect(insideRing(mandal.rings[0], 15.95, 80.95)).toBe(true)
    expect(insideRing(mandal.rings[0], 16.05, 80.95)).toBe(false)
  })

  test('by district code, or by GPS inside a mandal outline', () => {
    const alerts = [district, mandal]
    expect(alertsFor(alerts, { lgd: 733 }, BEFORE_EXPIRY).map((a) => a.id)).toEqual(['1'])
    expect(alertsFor(alerts, { lgd: 1, gps: { lat: 15.95, lon: 80.95 } }, BEFORE_EXPIRY).map((a) => a.id)).toEqual(['2'])
    // A district centre is not a GPS fix: mandal warnings need the farmer's own location.
    expect(alertsFor(alerts, { lgd: 1 }, BEFORE_EXPIRY)).toEqual([])
  })

  test('expired warnings and repeats are dropped; the most severe comes first', () => {
    const later = { ...district, id: '3', severity: 'Severe' as const, headlines: { en: 'Heavy rain' }, event: 'Heavy Rain' }
    const repeat = { ...district, id: '4' }
    expect(alertsFor([district, later, repeat], { lgd: 575 }, BEFORE_EXPIRY).map((a) => a.id)).toEqual(['3', '1'])
    expect(alertsFor([district], { lgd: 575 }, Date.parse('2026-10-13T04:00:00+05:30'))).toEqual([])
  })
})

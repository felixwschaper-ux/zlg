#!/usr/bin/env python3
"""Combine classified CSV + geocache into data.json.
UI strings translated to English. Original German reply text preserved verbatim.
"""
import csv, json

ROOT = '/Users/felixschaper/Downloads/zlg-dashboard'
SRC = '/Users/felixschaper/Downloads/u8wfJatWl_692ddbd73d4d1a1fe736ec13_klassifiziert.csv'
CACHE = f'{ROOT}/data/geocache.json'
OUT = f'{ROOT}/data.json'

STATUS_DE_EN = {
    'Ja':                            'Yes',
    'Nein':                          'No',
    'Nein (Ausnahme §76 mögl.)':     'No (§76 exception possible)',
    'Rückfrage':                     'Follow-up question',
    'Unklar':                        'Unclear',
    'Auto-Antwort':                  'Auto-reply',
    'Weitergeleitet':                'Forwarded',
    '':                              '(no reply)',
}

# English summary keyed by leadId
NOTES_EN = {
    "6a03775bf85d48337ee2e5dd": "Bad Salzungen (Wartburgkreis) — 'application possible if business location is in Wartburgkreis'",
    "6a037761f85d48337ee2e6fd": "Saalfeld-Rudolstadt — pure transfer in trade registration → no allocation",
    "6a037763f85d48337ee2e777": "Suhl — 'allocation to a self-employed transfer driver is therefore not possible'",
    "6a037751f85d48337ee2e3f9": "Altenholz/Rendsburg-Eckernförde — no entitlement without expanded trade registration",
    "6a037754f85d48337ee2e481": "Flensburg/Schleswig-Flensburg — 'currently I see no possibility to allocate a red plate'",
    "6a037757f85d48337ee2e52d": "Pinneberg — 'a clear rejection', not in the eligible group",
    "6a03773ff85d48337ee2e107": "St. Wendel — 'allocation only possible for the trades listed above'",
    "6a037741f85d48337ee2e178": "Borna/Leipzig — receipt confirmation, no substantive answer",
    "6a03774bf85d48337ee2e2f0": "Burg/Jerichower Land — 'in principle the office can issue an 06 plate to a transfer driver' with vehicle-related trade",
    "6a037733f85d48337ee2de70": "Mayen — asks where the planned business location is",
    "6a037736f85d48337ee2df1d": "Pirmasens/Südwestpfalz — requests company location",
    "6a03773bf85d48337ee2dff9": "Zweibrücken — requests data for review",
    "6a03773bf85d48337ee2e023": "Homburg/Saarpfalz — 'pure transport business' → no red plate",
    "6a03773bf85d48337ee2e049": "Merzig-Wadern — link to website, no case-specific statement",
    "6a03773cf85d48337ee2e079": "Neunkirchen — trade does not match the exhaustive list",
    "6a037727f85d48337ee2dc43": "Boppard/Rhein-Hunsrück — 'as a pure transfer driver you cannot apply for a red plate'",
    "6a037729f85d48337ee2dc97": "Eisenberg — forwarded to Donnersbergkreis colleague",
    "6a03772df85d48337ee2dd50": "Kaiserslautern (city) — 'planned trade does not qualify, allocation not possible'",
    "6a03772ef85d48337ee2dd8e": "Kirchheimbolanden/Donnersberg — only for the group listed in §41 FZV",
    "6a037717f85d48337ee2d8a4": "Meschede/Hochsauerlandkreis — 'pure transfer driving without trade evidence is not sufficient'",
    "6a037718f85d48337ee2d8c3": "Moers/Wesel — requests registration data",
    "6a037723f85d48337ee2db72": "Alzey-Worms — no entitlement; §76 FZV exception examined case by case",
    "6a037723f85d48337ee2db8e": "Andernach — asks where business will be registered",
    "6a03770ef85d48337ee2d754": "Heinsberg — automated receipt confirmation",
    "6a0376fef85d48337ee2d2d1": "Wildeshausen/Oldenburg — pure transfer providers not eligible; exception only via concrete application",
    "6a037701f85d48337ee2d3ce": "Ahaus/Borken — 'based on your statement, no objections to allocating red plates'",
    "6a037701f85d48337ee2d3f5": "Arnsberg/Hochsauerlandkreis — asks for residence and trade registration location",
    "6a037707f85d48337ee2d576": "Brilon/Hochsauerlandkreis — refers to §41 FZV / info sheet, no clear statement",
    "6a037709f85d48337ee2d618": "Duisburg — 'your inquiry cannot be answered positively'",
    "6a037709f85d48337ee2d645": "Düren — 'no red plate can be allocated for this purpose'",
    "6a0376f3f85d48337ee2cf9c": "Leer — application must first be reviewed",
    "6a0376fbf85d48337ee2d1ef": "Stadthagen/Schaumburg — 'as a transfer driver you will not get red plates'",
    "6a0376e8f85d48337ee2ccbe": "Brake/Wesermarsch — if trade registration covers vehicle transfer, red dealer plates can be issued upon written application",
    "6a0376e9f85d48337ee2cd25": "Bremervörde/Rotenburg (Wümme) — after reliability check, red plate will be allocated",
    "6a0376eaf85d48337ee2cd7b": "Cloppenburg — 'pure transfer driver trade without own dealership does not qualify'",
    "6a0376ecf85d48337ee2cddc": "Diepholz — asks for residence and trade registration location",
    "6a0376eff85d48337ee2cea9": "Goslar — '\"only transfer\" does not fall under this definition'",
    "6a0376d6f85d48337ee2c826": "Mühlheim am Main — refers to online appointment booking",
    "6a0376daf85d48337ee2c8fb": "Usingen/Hochtaunuskreis — 'only for vehicle dealers, repair shops, parts and full manufacturers'",
    "6a0376dff85d48337ee2ca16": "Demmin/Mecklenburgische Seenplatte — requirements not met; §76 exception possible via state authority",
    "6a0376e0f85d48337ee2ca50": "Grevesmühlen/Nordwestmecklenburg — trade form does not qualify; exception application via state authority",
    "6a0376cef85d48337ee2c63b": "Friedberg/Wetterau — 'a change or exception is unfortunately not possible'",
    "6a0376cff85d48337ee2c67a": "Gießen — 'pure transfer driving activity does not entitle allocation'",
    "6a0376d1f85d48337ee2c6f9": "Hofheim am Taunus/Main-Taunus — standard list of required documents, no case-specific statement",
    "6a0376d3f85d48337ee2c772": "Kassel — appointment in local office required",
    "6a0376c7f85d48337ee2c52e": "Bad Schwalbach/Rheingau-Taunus — 'allocation likely not possible' in this case",
    "6a0376bbf85d48337ee2c30b": "Eberswalde/Barnim — 'as you plan it, allocating a red plate is not possible'",
    "6a0376a2f85d48337ee2c184": "Moosburg a.d. Isar — 'only for vehicle dealers and repair shops'",
    "6a0376abf85d48337ee2c1e7": "Roding/Cham — asks for primary residence / business location",
    "6a037697f85d48337ee2c0fa": "Kaufbeuren — 'pure transfer trade does not match the qualifying activity fields'",
    "6a0376a0f85d48337ee2c17b": "Miesbach — business model does not apply",
    "6a037689f85d48337ee2c05d": "Dillingen a.d. Donau — broad interpretation 'cannot be shared from today's view'",
    "6a037689f85d48337ee2c060": "Dingolfing-Landau — application to be reviewed for whether it might still qualify",
    "6a037690f85d48337ee2c0b4": "Fürth (city) — 'no registration office will allocate red plates to you'",
    "6a037691f85d48337ee2c0b7": "Füssen/Ostallgäu — 'use in the pure service sector is not envisaged by the legislator'",
    "6a037683f85d48337ee2c020": "Bad Kötzting/Cham — only with vehicle dealer/repair shop/manufacturer trade",
    "6a037685f85d48337ee2c03f": "Bayreuth (district) — 'red plates for transfer drives are possible'",
    "6a037686f85d48337ee2c042": "Bayreuth (city) — asks whether trade is in city or district",
    "6a03766884fa0c2ee7835ecc": "Heidenheim (Brenz) — cites the exhaustive group per §41 FZV",
    "6a03766984fa0c2ee7835ecf": "Heilbronn (district) — terminology confusion, asks back",
    "6a03766a84fa0c2ee7835eea": "Karlsruhe (city) — asks for trade registration location",
    "6a03766b84fa0c2ee7835ef4": "Konstanz — asks in which city the trade will be registered",
    "6a037678f85d48337ee2bf13": "Ulm/Alb-Donau — standard application documents, no case-specific statement",
    "6a037679f85d48337ee2bf28": "Vaihingen/Ludwigsburg — 'not in the eligible group'; possible exception via Stuttgart regional authority",
    "6a03765d84fa0c2ee7835e5f": "Balingen/Zollernalbkreis — requests phone callback",
    "6a03765f84fa0c2ee7835e6b": "Bodenseekreis — 'legal requirements are not met'",
    "6a03766084fa0c2ee7835e75": "Bretten/Karlsruhe (district) — asks for business address",
    "6a03766284fa0c2ee7835e8b": "Donaueschingen/Schwarzwald-Baar — 'no red plate can be allocated for your trade'",
    "6a03766384fa0c2ee7835e9a": "Emmendingen — 'trade registration must show that you transfer vehicles' + application documents",
    "6a03766584fa0c2ee7835eb0": "Freiburg i.Br. — 'unfortunately no red plate' for pure transfer drivers without vehicle trade",
    "6a03765984fa0c2ee7835e44": "Aalen/Ostalbkreis — trade registration must include an activity meeting §41 criteria",
    "6a03765b84fa0c2ee7835e4d": "Backnang/Rems-Murr — no information without prior trade registration",
    "6a03765c84fa0c2ee7835e56": "Bad Saulgau/Sigmaringen — review only after submission of trade registration",
}

def normalize_date(s):
    """Convert DD/MM/YYYY → ISO 8601 (or pass through if already parseable)."""
    s = (s or '').strip()
    if not s:
        return ''
    import re
    m = re.match(r'^(\d{1,2})/(\d{1,2})/(\d{4})$', s)
    if m:
        d, mo, y = m.groups()
        return f"{y}-{int(mo):02d}-{int(d):02d}"
    return s

with open(CACHE) as f:
    cache = json.load(f)

with open(SRC) as f:
    rows = list(csv.DictReader(f))

out = []
for r in rows:
    name = r['customAttribute2'].strip()
    bl = r['location'].strip()
    if not name or bl == 'state_name':
        continue
    geo = cache.get(f"{name}|{bl}") or {}
    cls_de = r.get('rotes_dauerkennzeichen_ohne_kfz_handel', '').strip()
    cls_en = STATUS_DE_EN.get(cls_de, '(no reply)')
    note_en = NOTES_EN.get(r['leadId'], '')
    out.append({
        'id':         r['leadId'],
        'landkreis':  name,
        'bundesland': bl,
        'email':      r.get('proEmail', '').strip(),
        'phone':      r.get('phone', '').strip(),
        'lat':        geo.get('lat'),
        'lon':        geo.get('lon'),
        'status':     cls_en,
        'note':       note_en,
        'reply':      r.get('replyMessage', '').strip(),
        'replyDate':  normalize_date(r.get('replyDate', '')),
    })

with open(OUT, 'w') as f:
    json.dump(out, f, ensure_ascii=False)

# Sanity check: every reply row should have a note
missing_notes = [r for r in out if r['status'] != '(no reply)' and not r['note']]
print(f"Wrote {len(out)} records. {sum(1 for r in out if r['lat'] is not None)} geocoded.")
if missing_notes:
    print(f"WARN: {len(missing_notes)} answered rows missing English note:")
    for r in missing_notes[:10]:
        print(f"  {r['id']} | {r['landkreis']} | {r['status']}")

# Live traffic: what exists, what does not

Researched 14 Nov 2026. Everything below comes from public pages found that day; items marked **unverified** were not confirmed in full.

## Short answer

There is **no ready-made, free, open-source live traffic data feed for Malaysia**. What exists in open source are *routing engines that can accept* traffic speeds, plus a few partial data sources. The data itself has to come from somewhere, and for now there is no such source we can legally and freely use. Until one exists, Arah says "Live traffic: not available" and uses typical road speeds. It never shows invented congestion.

## Open-source engines that can use traffic data

| Engine | Traffic support | Catch |
| --- | --- | --- |
| Valhalla (what Arah uses) | Live and historical speeds, via traffic tiles linked to road edges | One speed value per road feature, so long roads are coarse. Described as a proof-of-concept in a 2023 ISPRS paper. |
| OSRM | Experimental segment-speed updates from a CSV file (use the MLD pipeline for minute-level updates) | You must supply the speeds yourself. |
| GraphHopper | Experimental, from 2015 | Same: you supply the data. |

Source: ISPRS Archives XLVIII-4/W7-2023 (open-source routing engines and traffic data); Valhalla "Traffic in Valhalla" docs; OSRM wiki "Traffic".

## Possible data sources

| Source | What it is | Usable for Arah? |
| --- | --- | --- |
| **data.gov.my GTFS-Realtime** | Bus vehicle positions (Rapid KL, MRT feeder, Penang, several Mybas cities, KTMB), refreshed every 30 s, licence CC BY 4.0. No API key mentioned on the page; rate limits on a separate page not read. | **Yes, experimentally.** Bus GPS can be turned into road speeds, but only on roads buses use, and buses stop at stops, so raw speeds understate car speeds. Needs a small server job and real testing before showing anything to drivers. |
| **Open Traffic / OSMLR** (Valhalla-linked, World Bank + Grab + Mapzen) | Open-source platform for turning GPS probes into speeds on OSM roads. Malaysia launched a version with Grab and MDEC. | **Software yes, data no.** Grab's announcement says the data is provided at no cost to *governments* under an open data license, not to the public. The open-source parts (OSMLR segments, reporter) could run our own probe pipeline. Project activity today is **unverified**. |
| **Waze for Cities** | Free incident and jam feed | **No.** It is a partner program for government agencies, not for apps. Scraping Waze is not allowed and Arah will not do it. |
| **LLM TuJu / Traffic Management Centre** | Official highway app with real-time highway reports and CCTV | **No public API found.** A reasonable next step is to ask LLM whether they share data openly. Cost and terms unknown. |
| **A crowdsourced probe network** | Phones report anonymous road speeds | **Only design papers.** A 2026 blog proposal for an OSM traffic service says it found no existing implementation, and lists the hard parts: too few users, fake jams, centralisation, privacy. |

## The privacy tension

Arah promises no accounts and no location history. Crowdsourced traffic needs phones to *send* positions. The only version consistent with the promise is:

1. **Opt-in**, off by default.
2. Matching to a road happens **on the phone**.
3. The phone sends only *(road segment, speed bucket, time bucket)*, never coordinates, never an ID.
4. The server publishes a segment only when **several** contributors agree (a minimum count), and rate-limits to resist fake jams.
5. Nothing is stored per person, because nothing identifies a person.

This only becomes useful with enough users in the same place at the same time, so it is a later phase, not a first feature.

## Recommended order

1. **Now:** honest "not available" label (done).
2. **Next:** an experimental bus-speed layer from data.gov.my, clearly labelled "estimated from bus GPS", only on roads where there is enough data. First measure coverage in Klang Valley before building the UI.
3. **In parallel:** email LLM and the Traffic Management Centre to ask about open data. Costs nothing.
4. **Later:** opt-in anonymous probes using the design above, once there are real users.

Whatever is added, it goes through the same rule as AWAS data: a source, a date, and a clear label of how live it really is.

const JELLYFIN_PLUGIN_ID = "plugin-jellyfin";

let jellyfinUrl = "";
let apiKey = "";
let template = "";

const JELLYFIN_LOGO =
  "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons@refs/heads/main/svg/jellyfin.svg";

function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function searchVariants(term) {
  const variants = [term];
  if (term.includes("-")) variants.push(term.replace(/-/g, " "));
  else if (/\w\s+\w/.test(term)) variants.push(term.replace(/\s+/g, "-"));
  if (term.includes(".")) variants.push(term.replace(/\./g, " "));
  if (term.includes("'")) variants.push(term.replace(/'/g, ""));
  return [...new Set(variants)];
}

const EPISODE_PATTERNS = [
  /^(.+?)\s+s(\d+)\s*e(\d+)$/i,
  /^(.+?)\s+season\s+(\d+)\s+episode\s+(\d+)$/i,
  /^(.+?)\s+season\s+(\d+)\s+ep\.?\s+(\d+)$/i,
  /^(.+?)\s+(\d+)x(\d+)$/i,
];

const SEASON_PATTERNS = [
  // "series season 1" or "series s01"
  /^(.+?)\s+season\s+(\d+)$/i,
  /^(.+?)\s+s(\d+)$/i,
];

function parseEpisodeQuery(term) {
  for (const re of EPISODE_PATTERNS) {
    const m = term.match(re);
    if (m) return { series: m[1].trim(), season: parseInt(m[2], 10), episode: parseInt(m[3], 10) };
  }
  for (const re of SEASON_PATTERNS) {
    const m = term.match(re);
    if (m) return { series: m[1].trim(), season: parseInt(m[2], 10), episode: null };
  }
  return null;
}

function renderItem(item) {
  const type = String(item["Type"] || "");
  const year = item["ProductionYear"] ? ` (${item["ProductionYear"]})` : "";

  let subtitle = "";
  if (type === "Episode") {
    const series = item["SeriesName"] || "";
    const sNum = item["ParentIndexNumber"];
    const eNum = item["IndexNumber"];
    const parts = [];
    if (series) parts.push(series);
    if (sNum != null && eNum != null)
      parts.push(`S${String(sNum).padStart(2, "0")}E${String(eNum).padStart(2, "0")}`);
    else if (eNum != null) parts.push(`Episode ${eNum}`);
    if (parts.length)
      subtitle = `<div class="result-episode-context">${escHtml(parts.join(" \u2014 "))}</div>`;
  } else if (type === "Season") {
    const series = item["SeriesName"] || "";
    if (series)
      subtitle = `<div class="result-episode-context">${escHtml(series)}</div>`;
  }

  const matchedPeople = item["MatchedPeople"];
  let badges = `<span class="result-engine-tag">${escHtml(type)}</span><span class="result-engine-tag">Jellyfin</span>`;
  if (matchedPeople?.length)
    badges += `<span class="result-engine-tag">${escHtml(matchedPeople.join(", "))}</span>`;

  const imageTags = item["ImageTags"];
  const hasThumb = !!imageTags?.["Primary"];
  const thumbSrc = `/api/proxy/image?auth_id=${JELLYFIN_PLUGIN_ID}&url=${encodeURIComponent(`${jellyfinUrl}/Items/${item["Id"]}/Images/Primary?maxHeight=120`)}`;
  const thumbBlock = hasThumb
    ? `<div class="result-thumbnail-wrap"><img class="result-thumbnail-img" src="${escHtml(thumbSrc)}" alt=""></div>`
    : "";

  const data = {
    faviconSrc: JELLYFIN_LOGO,
    cite: escHtml(jellyfinUrl),
    itemUrl: escHtml(`${jellyfinUrl}/web/index.html#!/details?id=${item["Id"]}`),
    title: escHtml(String(item["Name"] || "")) + year,
    subtitle,
    overview: escHtml(String(item["Overview"] || "")),
    badges,
    thumbBlock,
  };
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] ?? "");
}

async function findEpisode(epQuery, authHeaders, itemFields, limit, startIndex) {
  const seriesVariants = searchVariants(epQuery.series);
  const seriesFetches = seriesVariants.map((v) =>
    fetch(
      `${jellyfinUrl}/Items?SearchTerm=${encodeURIComponent(v)}&Recursive=true&Limit=10&Fields=ImageTags&IncludeItemTypes=Series`,
      { headers: authHeaders },
    ).then((r) => r.json()),
  );
  const seriesResults = await Promise.all(seriesFetches);
  const seen = new Set();
  const allSeries = [];
  for (const data of seriesResults) {
    for (const s of data.Items || []) {
      if (!seen.has(s.Id)) {
        seen.add(s.Id);
        allSeries.push(s);
      }
    }
  }
  if (allSeries.length === 0) return [];

  const episodeFetches = allSeries.map((s) => {
    let url = `${jellyfinUrl}/Shows/${s.Id}/Episodes?Fields=${itemFields}&Limit=${limit}&StartIndex=${startIndex}`;
    if (epQuery.season != null) url += `&Season=${epQuery.season}`;
    return fetch(url, { headers: authHeaders }).then((r) => r.json());
  });
  const episodeResults = await Promise.all(episodeFetches);

  const items = [];
  for (const data of episodeResults) {
    for (const ep of data.Items || []) {
      if (epQuery.episode != null) {
        if (ep.IndexNumber === epQuery.episode) items.push(ep);
      } else {
        items.push(ep);
      }
    }
  }
  return items;
}

export default {
  name: "Jellyfin",
  description: "Search your Jellyfin media library",
  trigger: "jellyfin",
  aliases: ["jf"],
  settingsSchema: [
    {
      key: "url",
      label: "Jellyfin URL",
      type: "url",
      required: true,
      placeholder: "https://your-jellyfin-server.com",
      description: "Base URL of your Jellyfin server",
    },
    {
      key: "apiKey",
      label: "API Key",
      type: "password",
      secret: true,
      required: true,
      placeholder: "Enter your Jellyfin API key",
      description: "Found in Jellyfin Dashboard → API Keys",
    },
  ],

  init(ctx) {
    template = ctx.template;
  },

  configure(settings) {
    jellyfinUrl = settings.url || "";
    apiKey = settings.apiKey || "";
  },

  async isConfigured() {
    return !!jellyfinUrl;
  },

  async execute(args, context) {
    if (!jellyfinUrl || !apiKey) {
      return {
        title: "Jellyfin Search",
        html: `<div class="command-result"><p>Jellyfin is not configured. Go to <a href="/settings">Settings → Plugins</a> to set up your Jellyfin URL and API key.</p></div>`,
      };
    }

    if (!args.trim()) {
      return {
        title: "Jellyfin Search",
        html: `<div class="command-result"><p>Usage: <code>!jellyfin &lt;search term&gt;</code></p></div>`,
      };
    }

    try {
      const term = args.trim();
      const page = context?.page ?? 1;
      const perPage = 25;
      const startIndex = (page - 1) * perPage;

      const authHeaders = { "X-Emby-Token": apiKey };
      const itemFields =
        "Overview,People,SeriesName,SeasonName,IndexNumber,ParentIndexNumber,ImageTags,ProductionYear";
      const itemTypes =
        "Movie,Series,Episode,Audio,MusicAlbum,MusicArtist,Season";

      const epQuery = parseEpisodeQuery(term);
      if (epQuery) {
        const epResults = await findEpisode(epQuery, authHeaders, itemFields, perPage, startIndex);
        if (epResults.length > 0) {
          const results = epResults.map((item) => renderItem(item)).join("");
          return {
            title: `Jellyfin: ${term} — ${epResults.length} results`,
            html: `<div class="command-result">${results}</div>`,
          };
        }
      }

      const variants = searchVariants(term);
      const fetches = [];
      for (const v of variants) {
        const enc = encodeURIComponent(v);
        fetches.push(
          fetch(
            `${jellyfinUrl}/Items?SearchTerm=${enc}&Recursive=true&Limit=${perPage}&StartIndex=${startIndex}&Fields=${itemFields}&IncludeItemTypes=${itemTypes}`,
            { headers: authHeaders },
          ).then((r) => r.json()),
        );
        fetches.push(
          fetch(
            `${jellyfinUrl}/Search/Hints?searchTerm=${enc}&Limit=${perPage}&StartIndex=${startIndex}&IncludeItemTypes=${itemTypes}`,
            { headers: authHeaders },
          ).then((r) => r.json()),
        );
      }
      fetches.push(
        fetch(
          `${jellyfinUrl}/Persons?searchTerm=${encodeURIComponent(term)}&Limit=5&Fields=Overview,PrimaryImageAspectRatio`,
          { headers: authHeaders },
        ).then((r) => r.json()),
      );

      const responses = await Promise.all(fetches);
      const peopleData = responses.pop();
      const itemsResults = [];
      const hintsResults = [];
      for (let i = 0; i < responses.length; i++) {
        if (i % 2 === 0) itemsResults.push(responses[i]);
        else hintsResults.push(responses[i]);
      }

      const people = peopleData.Items || [];
      const personIds = people.map((p) => p["Id"]);

      let personItems = [];
      if (personIds.length > 0) {
        const personItemsRes = await fetch(
          `${jellyfinUrl}/Items?PersonIds=${personIds.join(",")}&Recursive=true&Limit=30&Fields=${itemFields}&IncludeItemTypes=Movie,Series`,
          { headers: authHeaders },
        );
        const personItemsData = await personItemsRes.json();
        personItems = personItemsData.Items || [];
      }

      const seen = new Set();
      const allItems = [];
      let totalRecordCount = 0;

      for (const data of itemsResults) {
        if (data.TotalRecordCount > totalRecordCount)
          totalRecordCount = data.TotalRecordCount;
        for (const item of data.Items || []) {
          const id = String(item["Id"] || "");
          if (id && !seen.has(id)) {
            seen.add(id);
            allItems.push({ ...item, MatchedFrom: "search" });
          }
        }
      }

      for (const data of hintsResults) {
        for (const hint of data.SearchHints || []) {
          const id = String(hint["ItemId"] || "");
          if (id && !seen.has(id)) {
            seen.add(id);
            allItems.push({
              Id: id,
              Name: hint["Name"],
              Type: hint["Type"],
              ProductionYear: hint["ProductionYear"],
              Overview: hint["Overview"] || "",
              SeriesName: hint["Series"] || "",
              ImageTags: hint["PrimaryImageTag"]
                ? { Primary: hint["PrimaryImageTag"] }
                : {},
              MatchedFrom: "search",
            });
          }
        }
      }

      for (const item of personItems) {
        const id = String(item["Id"] || "");
        if (id && !seen.has(id)) {
          seen.add(id);
          const itemPeople = item["People"] || [];
          const termLower = term.toLowerCase();
          const matchedPeople = itemPeople
            .filter((p) =>
              String(p["Name"] || "")
                .toLowerCase()
                .includes(termLower),
            )
            .map(
              (p) =>
                `${String(p["Name"])} (${String(p["Type"] || p["Role"] || "Cast")})`,
            )
            .slice(0, 3);
          allItems.push({
            ...item,
            MatchedFrom: "person",
            MatchedPeople: matchedPeople,
          });
        }
      }

      if (allItems.length === 0) {
        return {
          title: "Jellyfin Search",
          html: `<div class="command-result"><p>No results found for "${escHtml(term)}"</p></div>`,
        };
      }

      const results = allItems.map((item) => renderItem(item)).join("");

      const totalHints = totalRecordCount || allItems.length;
      const totalPages = Math.ceil(totalHints / perPage);
      const pageInfo = totalPages > 1 ? ` — Page ${page} of ${totalPages}` : "";
      return {
        title: `Jellyfin: ${term} — ${totalHints} results${pageInfo}`,
        html: `<div class="command-result">${results}</div>`,
        totalPages,
      };
    } catch {
      return {
        title: "Jellyfin Search",
        html: `<div class="command-result"><p>Failed to connect to Jellyfin. Check your configuration.</p></div>`,
      };
    }
  },
};

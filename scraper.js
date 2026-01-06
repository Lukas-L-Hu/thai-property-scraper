const puppeteer = require('puppeteer');
const fs = require('fs');

class ThaiRealEstateScraper {
  constructor() {
    this.listings = [];
    this.browser = null;
  }

  async initialize() {
    this.browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ]
    });
  }

  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  async withPage(task) {
    const page = await this.browser.newPage();
    try {
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
      );
      page.setDefaultTimeout(30000);
      page.setDefaultNavigationTimeout(30000);
      return await task(page);
    } finally {
      await page.close();
    }
  }

  delay(ms = 2000) {
    return new Promise(res => setTimeout(res, ms));
  }

  log(source, message) {
    console.log(`[${new Date().toISOString()}][${source}] ${message}`);
  }

  parseNumber(text = '') {
    const n = parseInt(text.replace(/[^0-9]/g, ''), 10);
    return Number.isNaN(n) ? null : n;
  }

  normalizeListing(listing) {
    return {
      ...listing,
      priceValue: this.parseNumber(listing.price),
      sizeSqm: this.parseNumber(listing.size),
      bedroomsValue: this.parseNumber(listing.bedrooms),
      bathroomsValue: this.parseNumber(listing.bathrooms),
      images: [...new Set((listing.images || []).filter(Boolean))]
    };
  }

  addListings(source, listings) {
    const normalized = listings.map(l =>
      this.normalizeListing({ ...l, source })
    );
    this.listings.push(...normalized);
    this.log(source, `Added ${normalized.length} listings`);
  }

  deduplicate() {
    const seen = new Set();
    this.listings = this.listings.filter(l => {
      const key = l.url || `${l.title}-${l.price}-${l.location}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async scrapeDDProperty(url) {
    const listings = await this.withPage(async page => {
      this.log('DDProperty', 'Scraping...');
      await page.goto(url, { waitUntil: 'networkidle2' });

      return page.evaluate(() => {
        return Array.from(
          document.querySelectorAll('[data-testid="property-item"]')
        ).map(el => ({
          title: el.querySelector('[data-testid="property-title"]')?.textContent?.trim() || '',
          price: el.querySelector('[data-testid="property-price"]')?.textContent?.trim() || '',
          location: el.querySelector('[data-testid="property-location"]')?.textContent?.trim() || '',
          propertyType: el.querySelector('[data-testid="property-type"]')?.textContent?.trim() || '',
          size: el.querySelector('[data-testid="property-size"]')?.textContent?.trim() || '',
          bedrooms: el.querySelector('[data-testid="bedrooms"]')?.textContent?.trim() || '',
          bathrooms: el.querySelector('[data-testid="bathrooms"]')?.textContent?.trim() || '',
          description: el.querySelector('[data-testid="property-description"]')?.textContent?.trim() || '',
          images: Array.from(el.querySelectorAll('img')).map(img => img.src),
          agentInfo: el.querySelector('[data-testid="agent-info"]')?.textContent?.trim() || '',
          url: el.querySelector('a')?.href || ''
        }));
      });
    });

    this.addListings('DDProperty', listings);
    await this.delay();
  }

  async scrapePropertyShowcase(url) {
    const listings = await this.withPage(async page => {
        this.log('PropertyShowcase', 'Scraping...');
        await page.goto(url, { waitUntil: 'networkidle2' });

        return page.evaluate(() => {
        return Array.from(
            document.querySelectorAll('.property-card, [class*="property-item"]')
        ).map(el => ({
            title: el.querySelector('h2, h3, [class*="title"]')?.textContent?.trim() || '',
            price: el.querySelector('[class*="price"]')?.textContent?.trim() || '',
            location: el.querySelector('[class*="location"], [class*="address"]')?.textContent?.trim() || '',
            propertyType: el.querySelector('[class*="type"]')?.textContent?.trim() || '',
            size: el.querySelector('[class*="size"], [class*="area"]')?.textContent?.trim() || '',
            bedrooms: el.querySelector('[class*="bed"]')?.textContent?.trim() || '',
            bathrooms: el.querySelector('[class*="bath"]')?.textContent?.trim() || '',
            description: el.querySelector('[class*="description"]')?.textContent?.trim() || '',
            images: Array.from(el.querySelectorAll('img')).map(img => img.src || img.dataset?.src),
            agentInfo: el.querySelector('[class*="agent"]')?.textContent?.trim() || '',
            url: el.querySelector('a')?.href || ''
        }));
        });
    });

    this.addListings('PropertyShowcase', listings);
    await this.delay();
  }

  async scrapeHipflat(url) {
    const listings = await this.withPage(async page => {
      this.log('Hipflat', 'Scraping...');
      await page.goto(url, { waitUntil: 'networkidle2' });

      return page.evaluate(() => {
        return Array.from(document.querySelectorAll('article, [class*="listing"]'))
          .map(el => ({
            title: el.querySelector('h2, h3, a')?.textContent?.trim() || '',
            price: el.querySelector('[class*="price"]')?.textContent?.trim() || '',
            location: el.querySelector('[class*="location"]')?.textContent?.trim() || '',
            propertyType: el.querySelector('[class*="type"]')?.textContent?.trim() || '',
            size: el.querySelector('[class*="area"], [class*="size"]')?.textContent?.trim() || '',
            bedrooms: el.querySelector('[class*="bed"]')?.textContent?.trim() || '',
            bathrooms: el.querySelector('[class*="bath"]')?.textContent?.trim() || '',
            description: el.textContent?.substring(0, 500).trim() || '',
            images: Array.from(el.querySelectorAll('img')).map(img => img.src || img.dataset?.src),
            agentInfo: el.querySelector('[class*="agent"]')?.textContent?.trim() || '',
            url: el.querySelector('a')?.href || ''
          }));
      });
    });
    this.addListings('Hipflat', listings);
    await this.delay();
  }

  saveToJSON(filename = 'listings.json') {
    this.deduplicate();
    fs.writeFileSync(filename, JSON.stringify(this.listings, null, 2));
    this.log('SYSTEM', `Saved ${this.listings.length} listings to ${filename}`);
  }

  saveToCSV(filename = 'listings.csv') {
    this.deduplicate();
    if (!this.listings.length) return;

    const headers = [...new Set(this.listings.flatMap(Object.keys))];
    const rows = this.listings.map(l =>
      headers.map(h => `"${String(l[h] ?? '').replace(/"/g, '""')}"`).join(',')
    );

    fs.writeFileSync(filename, `${headers.join(',')}\n${rows.join('\n')}`);
    this.log('SYSTEM', `Saved ${this.listings.length} listings to ${filename}`);
  }

  filterByPrice(min, max) {
    return this.listings.filter(
      l => l.priceValue !== null && l.priceValue >= min && l.priceValue <= max
    );
  }

  filterByLocation(location) {
    return this.listings.filter(l =>
      l.location.toLowerCase().includes(location.toLowerCase())
    );
  }

  filterByPropertyType(type) {
    return this.listings.filter(l =>
      l.propertyType.toLowerCase().includes(type.toLowerCase())
    );
  }
}


async function main() {
  const scraper = new ThaiRealEstateScraper();
  await scraper.initialize();

  try {
    // Adds target URLs
    console.log('Add your target URLs to the main() function');
    console.log('Update the selectors based on the actual website structure');

  } finally {
    await scraper.closeBrowser();
  }
}

if (require.main == module) {
    main().catch(console.error);
}

module.exports = ThaiRealEstateScraper;
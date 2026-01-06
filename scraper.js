const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

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

  async scrapeDDProperty(searchUrl) {
    console.log('Scraping DDProperty...');
    const page = await this.browser.newPage();
    try {
      await page.goto(searchUrl, { waitUntil: 'networkidle2' });
      
      const listings = await page.evaluate(() => {
        const items = [];
        document.querySelectorAll('[data-testid="property-item"]').forEach(el => {
          items.push({
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
            url: el.querySelector('a')?.href || '',
            source: 'DDProperty'
          });
        });
        return items;
      });

      this.listings.push(...listings);
      console.log(`Found ${listings.length} listings on DDProperty`);
    } catch (error) {
      console.error('Error scraping DDProperty:', error.message);
    } finally {
      await page.close();
    }
  }

  async scrapePropertyShowcase(searchUrl) {
    console.log('Scraping PropertyShowcase...');
    const page = await this.browser.newPage();
    try {
      await page.goto(searchUrl, { waitUntil: 'networkidle2' });
      
      const listings = await page.evaluate(() => {
        const items = [];
        document.querySelectorAll('.property-card, [class*="property-item"]').forEach(el => {
          items.push({
            title: el.querySelector('h2, h3, [class*="title"]')?.textContent?.trim() || '',
            price: el.querySelector('[class*="price"]')?.textContent?.trim() || '',
            location: el.querySelector('[class*="location"], [class*="address"]')?.textContent?.trim() || '',
            propertyType: el.querySelector('[class*="type"]')?.textContent?.trim() || '',
            size: el.querySelector('[class*="size"], [class*="area"]')?.textContent?.trim() || '',
            bedrooms: el.querySelector('[class*="bed"]')?.textContent?.trim() || '',
            bathrooms: el.querySelector('[class*="bath"]')?.textContent?.trim() || '',
            description: el.querySelector('[class*="description"]')?.textContent?.trim() || '',
            images: Array.from(el.querySelectorAll('img')).map(img => img.src || img.dataset.src),
            agentInfo: el.querySelector('[class*="agent"]')?.textContent?.trim() || '',
            url: el.querySelector('a')?.href || '',
            source: 'PropertyShowcase'
          });
        });
        return items;
      });

      this.listings.push(...listings);
      console.log(`Found ${listings.length} listings on PropertyShowcase`);
    } catch (error) {
      console.error('Error scraping PropertyShowcase:', error.message);
    } finally {
      await page.close();
    }
  }

  async scrapThaiProperty(searchUrl) {
    console.log('Scraping ThaiProperty...');
    const page = await this.browser.newPage();
    try {
      await page.goto(searchUrl, { waitUntil: 'networkidle2' });
      
      const listings = await page.evaluate(() => {
        const items = [];
        document.querySelectorAll('[class*="listing"], [class*="property"]').forEach(el => {
          const priceEl = el.querySelector('[class*="price"]');
          const price = priceEl?.textContent?.trim() || '';
          
          items.push({
            title: el.querySelector('h2, h3')?.textContent?.trim() || '',
            price: price,
            location: el.querySelector('[class*="location"]')?.textContent?.trim() || '',
            propertyType: el.querySelector('[class*="type"]')?.textContent?.trim() || '',
            size: el.querySelector('[class*="area"], [class*="sqm"]')?.textContent?.trim() || '',
            bedrooms: el.querySelector('[class*="bedroom"], [class*="bed"]')?.textContent?.trim() || '',
            bathrooms: el.querySelector('[class*="bathroom"], [class*="bath"]')?.textContent?.trim() || '',
            description: el.querySelector('[class*="description"]')?.textContent?.trim() || '',
            images: Array.from(el.querySelectorAll('img')).map(img => img.src || img.dataset.src),
            agentInfo: el.querySelector('[class*="agent"], [class*="seller"]')?.textContent?.trim() || '',
            url: el.querySelector('a')?.href || '',
            source: 'ThaiProperty'
          });
        });
        return items;
      });

      this.listings.push(...listings);
      console.log(`Found ${listings.length} listings on ThaiProperty`);
    } catch (error) {
      console.error('Error scraping ThaiProperty:', error.message);
    } finally {
      await page.close();
    }
  }

  async scrapeHipflat(searchUrl) {
    console.log('Scraping Hipflat...');
    const page = await this.browser.newPage();
    try {
      await page.goto(searchUrl, { waitUntil: 'networkidle2' });
      
      const listings = await page.evaluate(() => {
        const items = [];
        document.querySelectorAll('article, [class*="listing"]').forEach(el => {
          items.push({
            title: el.querySelector('h2, h3, a')?.textContent?.trim() || '',
            price: el.querySelector('[class*="price"]')?.textContent?.trim() || '',
            location: el.querySelector('[class*="location"]')?.textContent?.trim() || '',
            propertyType: el.querySelector('[class*="type"]')?.textContent?.trim() || '',
            size: el.querySelector('[class*="area"], [class*="size"]')?.textContent?.trim() || '',
            bedrooms: el.querySelector('[class*="bed"]')?.textContent?.trim() || '',
            bathrooms: el.querySelector('[class*="bath"]')?.textContent?.trim() || '',
            description: el.textContent?.substring(0, 500).trim() || '',
            images: Array.from(el.querySelectorAll('img')).map(img => img.src || img.dataset.src),
            agentInfo: el.querySelector('[class*="agent"]')?.textContent?.trim() || '',
            url: el.querySelector('a')?.href || '',
            source: 'Hipflat'
          });
        });
        return items;
      });

      this.listings.push(...listings);
      console.log(`Found ${listings.length} listings on Hipflat`);
    } catch (error) {
      console.error('Error scraping Hipflat:', error.message);
    } finally {
      await page.close();
    }
  }

  saveToJSON(filename = 'listings.json') {
    fs.writeFileSync(filename, JSON.stringify(this.listings, null, 2));
    console.log(`Saved ${this.listings.length} listings to ${filename}`);
  }

  saveToCSV(filename = 'listings.csv') {
    if (this.listings.length === 0) {
      console.log('No listings to save');
      return;
    }

    const headers = Object.keys(this.listings[0]);
    let csv = headers.join(',') + '\n';

    this.listings.forEach(listing => {
      const row = headers.map(header => {
        let value = listing[header];
        if (Array.isArray(value)) {
          value = value.join(';');
        }
        value = String(value).replace(/"/g, '""');
        return `"${value}"`;
      });
      csv += row.join(',') + '\n';
    });

    fs.writeFileSync(filename, csv);
    console.log(`Saved ${this.listings.length} listings to ${filename}`);
  }

  getListings() {
    return this.listings;
  }

  filterByPrice(minPrice, maxPrice) {
    return this.listings.filter(listing => {
      const price = parseInt(listing.price.replace(/[^0-9]/g, ''));
      return price >= minPrice && price <= maxPrice;
    });
  }

  filterByLocation(location) {
    return this.listings.filter(listing =>
      listing.location.toLowerCase().includes(location.toLowerCase())
    );
  }

  filterByPropertyType(type) {
    return this.listings.filter(listing =>
      listing.propertyType.toLowerCase().includes(type.toLowerCase())
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

main().catch(console.error);

module.exports = ThaiRealEstateScraper;
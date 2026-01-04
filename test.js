const ThaiRealEstateScraper = require('./scraper');

async function test() {
  const scraper = new ThaiRealEstateScraper();
  await scraper.initialize();
  
  try {
    // Test with an actual URL
    await scraper.scrapeDDProperty('https://www.ddproperty.com/en/property-for-sale/bangkok');
    
    scraper.saveToJSON('test-listings.json');
    console.log('Done! Check test-listings.json');
  } finally {
    await scraper.closeBrowser();
  }
}

test().catch(console.error);
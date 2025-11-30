# AllJobs Web Scraper

A TypeScript-based web scraper for alljobs.co.il built using Test-Driven Development (TDD) approach with Evomi proxy support.

## Features

- **Comprehensive Scraping**: Scrapes all job listings from alljobs.co.il
- **Proxy Support**: Integrated with Evomi residential proxies for reliable scraping
- **Rate Limiting**: Configurable delays between requests to avoid detection
- **Retry Logic**: Automatic retry with exponential backoff on failures
- **Pagination Handling**: Automatically navigates through multiple pages
- **Data Export**: Exports results to JSON and CSV formats
- **Resume Capability**: Can resume scraping from a specific page
- **Hebrew Text Support**: Proper handling of Hebrew text encoding
- **Error Handling**: Comprehensive error handling and logging
- **Type Safety**: Full TypeScript with Zod validation

## Prerequisites

- Node.js 18+ 
- npm or yarn

## Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file based on `.env.example`:
```bash
cp .env.example .env
```

4. Configure your Evomi proxy credentials in `.env`:
```
EVOMI_PROXY_KEY=your-proxy-key-here
EVOMI_PROXY_ENDPOINT=your-proxy-endpoint (optional)
RATE_LIMIT_DELAY_MS=2500
```

## Usage

### Scraping Jobs

Run the scraper to collect jobs and save them to the database:

```bash
npm run dev
```

This will:
- Scrape jobs from alljobs.co.il
- Save them to SQLite database (`data/alljobs.db`)
- Display progress and statistics

### Running the API Server

Start the API server to access scraped data:

```bash
npm run api
```

The API will be available at `http://localhost:3000`

### Build and Run

```bash
npm run build
node dist/index.js
```

### Run Tests

```bash
npm test
```

### Run Tests with Coverage

```bash
npm run test:coverage
```

## Configuration

Environment variables can be set in `.env` file:

- `EVOMI_PROXY_KEY` - Evomi proxy API key (required)
- `EVOMI_PROXY_ENDPOINT` - Custom proxy endpoint (optional)
- `BASE_URL` - Base URL of alljobs.co.il (default: https://www.alljobs.co.il)
- `RATE_LIMIT_DELAY_MS` - Delay between requests in milliseconds (default: 2500)
- `MAX_RETRIES` - Maximum number of retry attempts (default: 3)
- `RETRY_DELAY_MS` - Initial retry delay in milliseconds (default: 1000)
- `LOG_LEVEL` - Logging level: error, warn, info, debug (default: info)
- `MAX_PAGES` - Maximum number of pages to scrape (optional)
- `RESUME_FROM_PAGE` - Page number to resume from (optional)

## Project Structure

```
src/
  scraper/
    AllJobsScraper.ts      # Main scraper orchestrator
    JobListingParser.ts    # HTML parser for job listings
    PaginationManager.ts   # Handles pagination logic
  proxy/
    EvomiProxyManager.ts  # Evomi proxy management
  http/
    HttpClient.ts          # HTTP client with proxy support
  export/
    DataExporter.ts        # Data export to JSON/CSV
  types/
    JobListing.ts          # Job listing types and schemas
    ScraperConfig.ts       # Configuration types
  utils/
    logger.ts              # Logging utility
    validators.ts           # Configuration validation
tests/
  unit/                    # Unit tests
  fixtures/                # Test fixtures
output/                    # Exported data (created automatically)
```

## Data Storage

Scraped data is stored in SQLite database:
- Database location: `data/alljobs.db`
- Jobs are automatically deduplicated by `job_id`
- All data persists between scraping runs

## API Endpoints

### Interactive API Documentation (Swagger)

Once the API server is running, visit:
```
http://localhost:3000/api-docs
```

This provides an interactive Swagger UI where you can:
- Browse all available endpoints
- See detailed request/response schemas
- Test endpoints directly from the browser
- View example requests and responses

### API Endpoints

See [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) for complete API documentation.

Quick examples:
- `GET /api/jobs` - Get all jobs (with filters and pagination)
- `GET /api/jobs/count` - Get total count of jobs
- `GET /api/jobs/export/csv` - Download CSV export
- `GET /api/jobs/export/json` - Download JSON export
- `GET /api/stats` - Get statistics
- `GET /health` - Health check
- `GET /api-docs` - Swagger API documentation

Example:
```bash
# Get first 10 jobs
curl http://localhost:3000/api/jobs?limit=10

# Download CSV
curl -O http://localhost:3000/api/jobs/export/csv

# Get statistics
curl http://localhost:3000/api/stats
```

## Error Handling

The scraper includes comprehensive error handling:
- Automatic retries with exponential backoff
- Graceful handling of network errors
- Validation of scraped data using Zod schemas
- Detailed logging for debugging

## Rate Limiting

The scraper respects rate limits to avoid being blocked:
- Default delay: 2.5 seconds between requests
- Configurable via `RATE_LIMIT_DELAY_MS` environment variable
- User-Agent rotation for additional protection

## Development

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Code Quality

```bash
# Lint code
npm run lint

# Format code
npm run format
```

## License

MIT

## Disclaimer

This scraper is for educational and research purposes only. Ensure you comply with alljobs.co.il's Terms of Service and robots.txt when using this tool. Always respect rate limits and use responsibly.


# Usage Examples - AllJobs Scraper API

## Viewing Jobs

### Get All Jobs (with pagination)

```bash
# Get first 10 jobs
curl "http://localhost:3000/api/jobs?limit=10"

# Get next 10 jobs (pagination)
curl "http://localhost:3000/api/jobs?limit=10&offset=10"
```

### View Job Details

```bash
# Get specific job by ID
curl "http://localhost:3000/api/jobs/8391177"
```

### Filter Jobs

```bash
# Filter by location
curl "http://localhost:3000/api/jobs?location=תל%20אביב&limit=10"

# Filter by company
curl "http://localhost:3000/api/jobs?company=חברה&limit=10"

# Filter by job type
curl "http://localhost:3000/api/jobs?jobType=משרה%20מלאה&limit=10"

# Combine multiple filters
curl "http://localhost:3000/api/jobs?location=תל%20אביב&jobType=משרה%20מלאה&limit=10"
```

## Exporting to CSV

### Export All Jobs

```bash
# Download ALL jobs as CSV (no filters)
curl -O "http://localhost:3000/api/jobs/export/csv"
```

### Export by Date Range

```bash
# Export jobs scraped from November 1st, 2025
curl -O "http://localhost:3000/api/jobs/export/csv?dateFrom=2025-11-01"

# Export jobs scraped between dates
curl -O "http://localhost:3000/api/jobs/export/csv?dateFrom=2025-11-01&dateTo=2025-11-30"

# Export today's jobs only
TODAY=$(date +%Y-%m-%d)
curl -O "http://localhost:3000/api/jobs/export/csv?dateFrom=$TODAY&dateTo=$TODAY"
```

### Export by Location

```bash
# Export all jobs from Tel Aviv
curl -O "http://localhost:3000/api/jobs/export/csv?location=תל%20אביב"
```

### Export by Company

```bash
# Export all jobs from specific company
curl -O "http://localhost:3000/api/jobs/export/csv?company=חברה"
```

### Export by Job Type

```bash
# Export all full-time jobs
curl -O "http://localhost:3000/api/jobs/export/csv?jobType=משרה%20מלאה"
```

### Combine Filters for Export

```bash
# Export full-time jobs from Tel Aviv, scraped in November
curl -O "http://localhost:3000/api/jobs/export/csv?location=תל%20אביב&jobType=משרה%20מלאה&dateFrom=2025-11-01&dateTo=2025-11-30"
```

## Viewing Job Content

### Using Swagger UI (Recommended)

1. Open `http://localhost:3000/api-docs` in your browser
2. Expand `GET /api/jobs`
3. Click "Try it out"
4. Set `limit` to see more jobs
5. Click "Execute"
6. View the full job details including description, requirements, etc.

### Using cURL

```bash
# Get first job with full details
curl "http://localhost:3000/api/jobs?limit=1" | jq '.data[0]'

# Get specific job by ID
curl "http://localhost:3000/api/jobs/8391177" | jq '.data'

# Get jobs and save to file for viewing
curl "http://localhost:3000/api/jobs?limit=100" > jobs.json
cat jobs.json | jq '.data[] | {jobId, title, company, location, description}'
```

### Using Browser

Simply open in browser:
```
http://localhost:3000/api/jobs?limit=10
```

The response will show JSON with all job details including:
- `jobId` - Unique identifier
- `title` - Job title
- `company` - Company name
- `description` - Full job description
- `location` - Job location
- `jobType` - Type of position
- `requirements` - Job requirements
- `applicationUrl` - URL to apply
- `postedDate` - When job was posted
- `companyId` - Company ID

## Statistics

```bash
# Get overall statistics
curl "http://localhost:3000/api/stats"

# Get count of jobs
curl "http://localhost:3000/api/jobs/count"

# Get count with filters
curl "http://localhost:3000/api/jobs/count?location=תל%20אביב"
```

## Date Format

All date filters use `YYYY-MM-DD` format:
- `2025-11-01` - November 1st, 2025
- `2025-11-30` - November 30th, 2025

## Examples in Different Languages

### JavaScript/TypeScript

```typescript
// Get jobs
const response = await fetch('http://localhost:3000/api/jobs?limit=10');
const data = await response.json();
console.log(data.data); // Array of jobs with full details

// Export CSV for date range
const csvResponse = await fetch(
  'http://localhost:3000/api/jobs/export/csv?dateFrom=2025-11-01&dateTo=2025-11-30'
);
const blob = await csvResponse.blob();
// Download blob

// Get specific job
const jobResponse = await fetch('http://localhost:3000/api/jobs/8391177');
const jobData = await jobResponse.json();
console.log(jobData.data.description); // Full job description
```

### Python

```python
import requests

# Get jobs with full details
response = requests.get('http://localhost:3000/api/jobs', params={'limit': 10})
data = response.json()
for job in data['data']:
    print(f"Job: {job['title']}")
    print(f"Company: {job['company']}")
    print(f"Description: {job['description']}")
    print("---")

# Export CSV for all jobs
csv_response = requests.get('http://localhost:3000/api/jobs/export/csv')
with open('all_jobs.csv', 'wb') as f:
    f.write(csv_response.content)

# Export CSV for date range
csv_response = requests.get(
    'http://localhost:3000/api/jobs/export/csv',
    params={'dateFrom': '2025-11-01', 'dateTo': '2025-11-30'}
)
with open('november_jobs.csv', 'wb') as f:
    f.write(csv_response.content)
```

## Tips

1. **View Full Content**: Use `GET /api/jobs` with `limit` parameter to see job details
2. **Export Everything**: Leave all filters empty to export ALL jobs
3. **Date Filtering**: Use `dateFrom` and `dateTo` to filter by when jobs were scraped
4. **Swagger UI**: Best way to explore and test the API interactively
5. **Pagination**: Use `limit` and `offset` for large result sets


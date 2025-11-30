# Swagger API Documentation Guide

## Overview

This project includes comprehensive Swagger/OpenAPI documentation for the AllJobs Scraper API. The documentation is automatically generated from code annotations and provides an interactive interface for exploring and testing the API.

## Accessing Swagger UI

Once the API server is running, access the Swagger documentation at:

```
http://localhost:3000/api-docs
```

## Features

### Interactive Documentation
- **Browse Endpoints**: View all available API endpoints organized by tags
- **Test Requests**: Execute API calls directly from the browser
- **View Schemas**: See detailed request/response schemas with examples
- **Try It Out**: Test endpoints with custom parameters

### Documentation Quality

The Swagger documentation includes:

1. **Complete API Information**
   - API title, version, and description
   - Server URLs (development and production)
   - Contact information

2. **Detailed Endpoint Documentation**
   - Summary and description for each endpoint
   - Request parameters with types and examples
   - Response schemas with status codes
   - Example requests and responses

3. **Schema Definitions**
   - JobListing schema with all fields
   - Response schemas (JobsResponse, CountResponse, StatsResponse, etc.)
   - Error response schemas
   - Reusable parameter definitions

4. **Tags and Organization**
   - Endpoints grouped by functionality (Jobs, Export, Statistics, Health)
   - Clear categorization for easy navigation

## Using Swagger UI

### 1. View Endpoints

Navigate through the different endpoint groups:
- **Jobs**: Operations for retrieving job listings
- **Export**: Endpoints for exporting data
- **Statistics**: Get statistics about scraped jobs
- **Health**: Health check endpoint

### 2. Test an Endpoint

1. Click on an endpoint to expand it
2. Click "Try it out" button
3. Fill in the parameters (if any)
4. Click "Execute"
5. View the response below

### 3. Example: Get Jobs

1. Expand `GET /api/jobs`
2. Click "Try it out"
3. Set `limit` to `10`
4. Optionally set filters (company, location, jobType)
5. Click "Execute"
6. View the response with job listings

### 4. Example: Export CSV

1. Expand `GET /api/jobs/export/csv`
2. Click "Try it out"
3. Optionally set filters
4. Click "Execute"
5. The browser will download the CSV file

## API Schema Details

### JobListing Schema

The main data model includes:
- `jobId`: Unique identifier
- `title`: Job title (Hebrew supported)
- `company`: Company name
- `description`: Full job description
- `location`: Job location
- `jobType`: Type of position (משרה מלאה, משרה חלקית, etc.)
- `requirements`: Job requirements (optional)
- `applicationUrl`: URL to apply
- `postedDate`: When job was posted (optional)
- `companyId`: Company ID (optional)

### Response Formats

All endpoints return JSON with:
- `success`: Boolean indicating success/failure
- `data`: Response data (varies by endpoint)
- `error`: Error message (if failed)

## Export Formats

### CSV Export
- Includes UTF-8 BOM for Excel compatibility
- All Hebrew text properly encoded
- Headers in English for compatibility

### JSON Export
- Formatted with 2-space indentation
- UTF-8 encoded
- Complete job data with all fields

## Filtering and Pagination

### Query Parameters

- `limit`: Maximum number of results (1-1000, default: 100)
- `offset`: Number of results to skip (default: 0)
- `company`: Filter by company name (partial match)
- `location`: Filter by location (partial match)
- `jobType`: Filter by job type (exact match)

### Examples

```
# Get first 20 jobs
GET /api/jobs?limit=20

# Get jobs from Tel Aviv
GET /api/jobs?location=תל%20אביב

# Get full-time jobs, skip first 10
GET /api/jobs?jobType=משרה%20מלאה&limit=20&offset=10

# Export CSV for specific company
GET /api/jobs/export/csv?company=חברה
```

## Best Practices

1. **Use Pagination**: Always use `limit` and `offset` for large result sets
2. **Filter Before Export**: Apply filters before exporting to reduce file size
3. **Check Health**: Use `/health` endpoint to verify API availability
4. **Review Schemas**: Check response schemas before implementing client code

## Integration Examples

### JavaScript/TypeScript

```typescript
// Get jobs
const response = await fetch('http://localhost:3000/api/jobs?limit=10');
const data = await response.json();
console.log(data.data); // Array of jobs

// Export CSV
const csvResponse = await fetch('http://localhost:3000/api/jobs/export/csv');
const blob = await csvResponse.blob();
// Download blob as file
```

### Python

```python
import requests

# Get jobs
response = requests.get('http://localhost:3000/api/jobs', params={'limit': 10})
data = response.json()
print(data['data'])  # List of jobs

# Export CSV
csv_response = requests.get('http://localhost:3000/api/jobs/export/csv')
with open('jobs.csv', 'wb') as f:
    f.write(csv_response.content)
```

### cURL

```bash
# Get jobs
curl "http://localhost:3000/api/jobs?limit=10"

# Export CSV
curl -O "http://localhost:3000/api/jobs/export/csv"

# Get statistics
curl "http://localhost:3000/api/stats"
```

## Troubleshooting

### Swagger UI Not Loading

1. Ensure API server is running: `npm run api`
2. Check server logs for errors
3. Verify port 3000 is not in use
4. Try accessing `http://localhost:3000/health` first

### Endpoints Not Working

1. Check that database exists: `data/alljobs.db`
2. Verify jobs have been scraped: `GET /api/jobs/count`
3. Check server logs for error messages
4. Verify CORS is enabled (should be by default)

### Export Issues

1. Ensure output directory exists: `output/`
2. Check file permissions
3. Verify database has data
4. Check server logs for export errors

## Additional Resources

- [OpenAPI Specification](https://swagger.io/specification/)
- [Swagger UI Documentation](https://swagger.io/tools/swagger-ui/)
- [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) - Detailed API reference


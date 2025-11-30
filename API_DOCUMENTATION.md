# AllJobs Scraper API Documentation

## Overview

RESTful API for accessing scraped job listings from alljobs.co.il with database storage and CSV/JSON export capabilities.

## Database Schema

### Jobs Table
- `id` - Primary key (auto-increment)
- `job_id` - Unique job identifier from alljobs.co.il
- `title` - Job title
- `company` - Company name
- `description` - Job description
- `location` - Job location
- `job_type` - Type of job (משרה מלאה, משרה חלקית, etc.)
- `requirements` - Job requirements (optional)
- `application_url` - URL to apply for the job
- `posted_date` - Date job was posted (optional)
- `company_id` - Company ID from alljobs.co.il (optional)
- `created_at` - Record creation timestamp
- `updated_at` - Record last update timestamp

### Scraping Sessions Table
- `id` - Primary key (auto-increment)
- `started_at` - Session start timestamp
- `completed_at` - Session completion timestamp
- `pages_scraped` - Number of pages scraped
- `jobs_found` - Number of jobs found
- `status` - Session status (running, completed, failed)
- `error_message` - Error message if failed

## API Endpoints

### Base URL
```
http://localhost:3000
```

### 1. Get Jobs
**GET** `/api/jobs`

Get all jobs with optional filters and pagination.

**Query Parameters:**
- `limit` (optional) - Number of jobs to return (default: all)
- `offset` (optional) - Number of jobs to skip (default: 0)
- `company` (optional) - Filter by company name (partial match)
- `location` (optional) - Filter by location (partial match)
- `jobType` (optional) - Filter by job type (exact match)

**Example:**
```bash
GET /api/jobs?limit=10&offset=0&location=תל%20אביב
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "jobId": "8391177",
      "title": "דרוש /ה עו\"ד בתחום המיסוי המוניציפאלי",
      "company": "חברה חסויה",
      "description": "...",
      "location": "תל אביב",
      "jobType": "משרה מלאה",
      "applicationUrl": "/Search/UploadSingle.aspx?JobID=8391177"
    }
  ],
  "pagination": {
    "total": 540,
    "limit": 10,
    "offset": 0
  }
}
```

### 2. Get Jobs Count
**GET** `/api/jobs/count`

Get total count of jobs with optional filters.

**Query Parameters:**
- `company` (optional) - Filter by company name
- `location` (optional) - Filter by location
- `jobType` (optional) - Filter by job type

**Example:**
```bash
GET /api/jobs/count?location=תל%20אביב
```

**Response:**
```json
{
  "success": true,
  "count": 150
}
```

### 3. Export to CSV
**GET** `/api/jobs/export/csv`

Export jobs to CSV format and download.

**Query Parameters:**
- `company` (optional) - Filter by company name
- `location` (optional) - Filter by location
- `jobType` (optional) - Filter by job type

**Example:**
```bash
GET /api/jobs/export/csv?location=תל%20אביב
```

**Response:** CSV file download

### 4. Export to JSON
**GET** `/api/jobs/export/json`

Export jobs to JSON format and download.

**Query Parameters:**
- `company` (optional) - Filter by company name
- `location` (optional) - Filter by location
- `jobType` (optional) - Filter by job type

**Example:**
```bash
GET /api/jobs/export/json
```

**Response:** JSON file download

### 5. Get Statistics
**GET** `/api/stats`

Get statistics about scraped jobs.

**Response:**
```json
{
  "success": true,
  "data": {
    "totalJobs": 540,
    "uniqueCompanies": 120,
    "uniqueLocations": 45,
    "jobsByType": {
      "משרה מלאה": 400,
      "משרה חלקית": 140
    }
  }
}
```

### 6. Health Check
**GET** `/health`

Check API server health.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-11-30T08:30:00.000Z"
}
```

## Usage Examples

### Start API Server
```bash
npm run api
```

### Get first 20 jobs
```bash
curl http://localhost:3000/api/jobs?limit=20
```

### Download CSV export
```bash
curl -O http://localhost:3000/api/jobs/export/csv
```

### Get jobs from specific location
```bash
curl "http://localhost:3000/api/jobs?location=תל%20אביב&limit=10"
```

## Database Location

Database file: `data/alljobs.db`

## Notes

- All text fields support Hebrew characters (UTF-8)
- CSV exports include UTF-8 BOM for Excel compatibility
- Database uses SQLite with WAL mode for better concurrency
- Jobs are automatically deduplicated by `job_id`


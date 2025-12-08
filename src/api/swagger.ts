import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Multi-Source Job Scraper API',
      version: '2.0.0',
      description: `
# Multi-Source Job Scraper API

A comprehensive, production-ready RESTful API for accessing scraped job listings from multiple Israeli job platforms.

## Overview

This API provides programmatic access to job listings scraped from multiple sources:
- **AllJobs** (alljobs.co.il) - Israel's largest job board
- **JobMaster** (jobmaster.co.il) - Professional job search platform
- **Madlan** (madlan.co.il) - Real estate listings platform
- **CarWiz** (carwiz.co.il) - Car listings platform (agency listings only)
- **Freesbe** (freesbe.com) - Aggregated car listing data platform

## API Architecture

The API follows a hierarchical structure:

\`\`\`
/api/jobs/{platform}/{endpoint}
\`\`\`

Where:
- \`{platform}\` can be: \`alljobs\` or \`jobmaster\`
- \`{endpoint}\` includes: listings, count, export formats, filters, etc.

## Key Features

### 🔍 Advanced Filtering
- Filter by company name (partial match, case-insensitive)
- Filter by location (supports Hebrew and English)
- Filter by job type
- Filter by scraping date range
- Combine multiple filters for precise results

### 📊 Data Export
- **CSV Export**: Download jobs as CSV files with UTF-8 BOM for Excel compatibility
- **JSON Export**: Download jobs as formatted JSON files
- All exports support filtering
- Automatic file cleanup after download

### 📈 Statistics & Analytics
- Real-time job counts per platform
- Unique company and location statistics
- Job type distribution
- Scraping session history

### 🗄️ Database Features
- SQLite database with automatic deduplication
- Separate databases per platform for complete isolation
- Indexed queries for fast performance
- Transaction support for data integrity

## Authentication

Currently, the API does not require authentication. Future versions may include:
- API key authentication
- OAuth 2.0 support
- Rate limiting per API key

## Rate Limiting

No rate limiting is currently implemented. Please use responsibly and consider implementing client-side throttling for production use.

## Data Format

- **Encoding**: All endpoints use UTF-8 encoding
- **Hebrew Support**: Full support for Hebrew characters in all text fields
- **Date Format**: ISO 8601 (YYYY-MM-DD) for date filters
- **CSV Format**: UTF-8 BOM included for Excel compatibility

## Error Handling

All endpoints follow a consistent error response format:

\`\`\`json
{
  "success": false,
  "error": "Error message description"
}
\`\`\`

HTTP status codes:
- \`200\`: Success
- \`404\`: Resource not found
- \`500\`: Internal server error

## Pagination

List endpoints support pagination using \`limit\` and \`offset\` query parameters:
- Default limit: 100 items
- Maximum limit: 1000 items
- Offset: Number of items to skip

## Best Practices

1. **Use pagination** for large datasets
2. **Filter before exporting** to reduce file sizes
3. **Cache responses** when appropriate
4. **Handle errors gracefully** with retry logic
5. **Respect rate limits** (when implemented)

## Support

For API support, issues, or feature requests, please contact the development team.

## License

MIT License - See LICENSE file for details.
      `,
      contact: {
        name: 'API Support Team',
        email: 'api-support@example.com',
        url: 'https://github.com/your-org/scrapers',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
      termsOfService: 'https://example.com/terms',
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
      {
        url: 'https://api.example.com',
        description: 'Production server',
      },
    ],
    tags: [
      {
        name: 'Jobs',
        description: 'Operations for retrieving job listings from all platforms',
        externalDocs: {
          description: 'Find out more about job listings',
          url: 'https://example.com/docs/jobs',
        },
      },
      {
        name: 'AllJobs',
        description: 'Operations specific to AllJobs platform (alljobs.co.il)',
      },
      {
        name: 'Cars',
        description: 'Operations for retrieving car listings from car platforms',
        externalDocs: {
          description: 'Find out more about car listings',
          url: 'https://example.com/docs/cars',
        },
      },
      {
        name: 'CarWiz',
        description: 'Operations specific to CarWiz platform (carwiz.co.il)',
      },
      {
        name: 'Freesbe',
        description: 'Operations specific to Freesbe platform (freesbe.com)',
      },
      {
        name: 'JobMaster',
        description: 'Operations specific to JobMaster platform (jobmaster.co.il)',
      },
      {
        name: 'Export',
        description: 'Export job listings to various file formats (CSV, JSON)',
      },
      {
        name: 'Statistics',
        description: 'Get statistics and analytics about scraped jobs',
      },
      {
        name: 'Dashboard',
        description: 'Dashboard data and scraping session information',
      },
      {
        name: 'Real Estate',
        description: 'Operations for real estate platforms (נדלן)',
        externalDocs: {
          description: 'Real Estate API Documentation',
          url: 'https://example.com/docs/realestate',
        },
      },
      {
        name: 'Madlan',
        description: 'Operations for Madlan real estate platform (madlan.co.il)',
      },
      {
        name: 'Health',
        description: 'Health check and server status endpoints',
      },
    ],
    components: {
      schemas: {
        JobListing: {
          type: 'object',
          required: ['jobId', 'title', 'company', 'description', 'location', 'jobType', 'applicationUrl', 'source'],
          properties: {
            jobId: {
              type: 'string',
              description: 'Unique job identifier from the source platform',
              example: '8391177',
            },
            title: {
              type: 'string',
              description: 'Job title or position name',
              example: 'דרוש /ה עו"ד בתחום המיסוי המוניציפאלי',
            },
            company: {
              type: 'string',
              description: 'Company name offering the position',
              example: 'חברה חסויה',
            },
            description: {
              type: 'string',
              description: 'Full job description including responsibilities and requirements',
              example: 'משרדנו מתמחה במשפט מנהלי, רשויות מקומיות ומיסוי מוניציפאלי...',
            },
            location: {
              type: 'string',
              description: 'Job location (city, region, or remote)',
              example: 'תל אביב',
            },
            jobType: {
              type: 'string',
              description: 'Type of employment (full-time, part-time, shifts, etc.)',
              enum: ['משרה מלאה', 'משרה חלקית', 'משמרות', 'Unknown'],
              example: 'משרה מלאה',
            },
            requirements: {
              type: 'string',
              description: 'Job requirements and qualifications',
              nullable: true,
              example: 'ניסיון של 02 שנים. עדיפות תינתן לבעלי ניסיון ממשרדים העוסקים בארנונה.',
            },
            applicationUrl: {
              type: 'string',
              description: 'URL to apply for the job (can be relative or absolute)',
              example: '/Search/UploadSingle.aspx?JobID=8391177',
            },
            postedDate: {
              type: 'string',
              format: 'date',
              description: 'Date when the job was posted on the source platform',
              nullable: true,
              example: '2025-01-15',
            },
            companyId: {
              type: 'string',
              description: 'Company identifier from the source platform',
              nullable: true,
              example: '12345',
            },
            source: {
              type: 'string',
              enum: ['alljobs', 'jobmaster'],
              description: 'Source platform identifier',
              example: 'alljobs',
            },
          },
        },
        JobsResponse: {
          type: 'object',
          required: ['success', 'data', 'pagination'],
          properties: {
            success: {
              type: 'boolean',
              description: 'Indicates if the request was successful',
              example: true,
            },
            data: {
              type: 'array',
              description: 'Array of job listings',
              items: {
                $ref: '#/components/schemas/JobListing',
              },
            },
            pagination: {
              type: 'object',
              required: ['total', 'limit', 'offset'],
              properties: {
                total: {
                  type: 'integer',
                  description: 'Total number of jobs matching the filters',
                  example: 540,
                },
                limit: {
                  type: 'integer',
                  description: 'Number of jobs returned in this response',
                  example: 10,
                },
                offset: {
                  type: 'integer',
                  description: 'Number of jobs skipped',
                  example: 0,
                },
              },
            },
          },
        },
        CountResponse: {
          type: 'object',
          required: ['success', 'count'],
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            count: {
              type: 'integer',
              description: 'Total number of jobs matching the filters',
              example: 540,
            },
          },
        },
        StatsResponse: {
          type: 'object',
          required: ['success', 'data'],
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            data: {
              type: 'object',
              required: ['totalJobs', 'uniqueCompanies', 'uniqueLocations', 'jobsByType', 'sources'],
              properties: {
                totalJobs: {
                  type: 'integer',
                  description: 'Total number of jobs across all platforms',
                  example: 540,
                },
                uniqueCompanies: {
                  type: 'integer',
                  description: 'Number of unique companies across all platforms',
                  example: 120,
                },
                uniqueLocations: {
                  type: 'integer',
                  description: 'Number of unique locations across all platforms',
                  example: 45,
                },
                jobsByType: {
                  type: 'object',
                  description: 'Number of jobs grouped by job type',
                  additionalProperties: {
                    type: 'integer',
                  },
                  example: {
                    'משרה מלאה': 400,
                    'משרה חלקית': 140,
                  },
                },
                sources: {
                  type: 'object',
                  description: 'Job count per platform',
                  properties: {
                    alljobs: {
                      type: 'integer',
                      example: 400,
                    },
                    jobmaster: {
                      type: 'integer',
                      example: 140,
                    },
                  },
                },
              },
            },
          },
        },
        DashboardResponse: {
          type: 'object',
          required: ['success', 'data'],
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            data: {
              type: 'object',
              required: ['stats', 'alljobs', 'jobmaster'],
              properties: {
                stats: {
                  type: 'object',
                  description: 'Combined statistics from all platforms',
                  properties: {
                    totalJobs: { type: 'integer', example: 540 },
                    uniqueCompanies: { type: 'integer', example: 120 },
                    uniqueLocations: { type: 'integer', example: 45 },
                    uniqueJobTypes: { type: 'integer', example: 3 },
                  },
                },
                alljobs: {
                  type: 'object',
                  description: 'AllJobs platform statistics',
                  properties: {
                    totalJobs: { type: 'integer', example: 400 },
                    uniqueCompanies: { type: 'integer', example: 100 },
                    uniqueLocations: { type: 'integer', example: 35 },
                    uniqueJobTypes: { type: 'integer', example: 3 },
                    lastScrapingSession: { type: 'object', nullable: true },
                    scrapingSessions: { type: 'array' },
                  },
                },
                jobmaster: {
                  type: 'object',
                  description: 'JobMaster platform statistics',
                  properties: {
                    totalJobs: { type: 'integer', example: 140 },
                    uniqueCompanies: { type: 'integer', example: 50 },
                    uniqueLocations: { type: 'integer', example: 20 },
                    uniqueJobTypes: { type: 'integer', example: 2 },
                    lastScrapingSession: { type: 'object', nullable: true },
                    scrapingSessions: { type: 'array' },
                  },
                },
              },
            },
          },
        },
        ErrorResponse: {
          type: 'object',
          required: ['success', 'error'],
          properties: {
            success: {
              type: 'boolean',
              example: false,
            },
            error: {
              type: 'string',
              description: 'Human-readable error message',
              example: 'Failed to retrieve jobs',
            },
            message: {
              type: 'string',
              description: 'Additional error details or suggestions',
              nullable: true,
              example: 'No jobs match the provided filters. Try removing filters to export all jobs.',
            },
          },
        },
        HealthResponse: {
          type: 'object',
          required: ['status', 'timestamp'],
          properties: {
            status: {
              type: 'string',
              enum: ['ok'],
              description: 'Server health status',
              example: 'ok',
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'Current server timestamp in ISO 8601 format',
              example: '2025-11-30T08:30:00.000Z',
            },
          },
        },
        FilterOptionsResponse: {
          type: 'object',
          required: ['success', 'data'],
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            data: {
              type: 'object',
              required: ['companies', 'locations', 'jobTypes'],
              properties: {
                companies: {
                  type: 'array',
                  description: 'List of all unique company names',
                  items: {
                    type: 'string',
                  },
                  example: ['חברה א', 'חברה ב', 'TechTalent'],
                },
                locations: {
                  type: 'array',
                  description: 'List of all unique locations',
                  items: {
                    type: 'string',
                  },
                  example: ['תל אביב', 'ירושלים', 'Haifa', 'Tel Aviv'],
                },
                jobTypes: {
                  type: 'array',
                  description: 'List of all unique job types',
                  items: {
                    type: 'string',
                  },
                  example: ['משרה מלאה', 'משרה חלקית', 'משמרות'],
                },
              },
            },
          },
        },
      },
      parameters: {
        LimitParam: {
          name: 'limit',
          in: 'query',
          description: 'Maximum number of jobs to return. Default: 100, Maximum: 1000',
          required: false,
          schema: {
            type: 'integer',
            minimum: 1,
            maximum: 1000,
            default: 100,
          },
          example: 10,
        },
        OffsetParam: {
          name: 'offset',
          in: 'query',
          description: 'Number of jobs to skip for pagination. Default: 0',
          required: false,
          schema: {
            type: 'integer',
            minimum: 0,
            default: 0,
          },
          example: 0,
        },
        CompanyFilter: {
          name: 'company',
          in: 'query',
          description: 'Filter jobs by company name. Supports partial match and is case-insensitive. Can match Hebrew or English company names.',
          required: false,
          schema: {
            type: 'string',
            minLength: 1,
          },
          example: 'חברה',
        },
        LocationFilter: {
          name: 'location',
          in: 'query',
          description: 'Filter jobs by location. Supports partial match, case-insensitive, and automatically maps Hebrew city names to English equivalents.',
          required: false,
          schema: {
            type: 'string',
            minLength: 1,
          },
          example: 'תל אביב',
        },
        JobTypeFilter: {
          name: 'jobType',
          in: 'query',
          description: 'Filter jobs by job type. Must match exactly (case-sensitive).',
          required: false,
          schema: {
            type: 'string',
            enum: ['משרה מלאה', 'משרה חלקית', 'משמרות'],
          },
          example: 'משרה מלאה',
        },
        DateFromFilter: {
          name: 'dateFrom',
          in: 'query',
          description: 'Filter jobs scraped from this date (inclusive). Format: YYYY-MM-DD. Filters by the created_at field (when job was scraped, not when it was posted).',
          required: false,
          schema: {
            type: 'string',
            format: 'date',
            pattern: '^\\d{4}-\\d{2}-\\d{2}$',
          },
          example: '2025-11-01',
        },
        DateToFilter: {
          name: 'dateTo',
          in: 'query',
          description: 'Filter jobs scraped until this date (inclusive). Format: YYYY-MM-DD. Filters by the created_at field (when job was scraped, not when it was posted).',
          required: false,
          schema: {
            type: 'string',
            format: 'date',
            pattern: '^\\d{4}-\\d{2}-\\d{2}$',
          },
          example: '2025-11-30',
        },
        JobIdParam: {
          name: 'jobId',
          in: 'path',
          required: true,
          description: 'Unique job identifier from the source platform',
          schema: {
            type: 'string',
            minLength: 1,
          },
          example: '8391177',
        },
        PlatformParam: {
          name: 'platform',
          in: 'path',
          required: true,
          description: 'Job platform identifier',
          schema: {
            type: 'string',
            enum: ['alljobs', 'jobmaster'],
          },
          example: 'alljobs',
        },
      },
      examples: {
        JobListingExample: {
          summary: 'Example job listing',
          value: {
            jobId: '8391177',
            title: 'דרוש /ה עו"ד בתחום המיסוי המוניציפאלי',
            company: 'חברה חסויה',
            description: 'משרדנו מתמחה במשפט מנהלי, רשויות מקומיות ומיסוי מוניציפאלי...',
            location: 'תל אביב',
            jobType: 'משרה מלאה',
            requirements: 'ניסיון של 02 שנים. עדיפות תינתן לבעלי ניסיון ממשרדים העוסקים בארנונה.',
            applicationUrl: '/Search/UploadSingle.aspx?JobID=8391177',
            postedDate: '2025-01-15',
            companyId: '12345',
            source: 'alljobs',
          },
        },
        JobsResponseExample: {
          summary: 'Example jobs response with pagination',
          value: {
            success: true,
            data: [
              {
                jobId: '8391177',
                title: 'דרוש /ה עו"ד בתחום המיסוי המוניציפאלי',
                company: 'חברה חסויה',
                description: 'משרדנו מתמחה במשפט מנהלי...',
                location: 'תל אביב',
                jobType: 'משרה מלאה',
                applicationUrl: '/Search/UploadSingle.aspx?JobID=8391177',
                source: 'alljobs',
              },
            ],
            pagination: {
              total: 540,
              limit: 10,
              offset: 0,
            },
          },
        },
      },
    },
  },
  apis: [
    './src/api/routes/**/*.ts',
    './src/api/server.ts',
    './dist/api/routes/**/*.js',
    './dist/api/server.js',
  ],
};

export const swaggerSpec = swaggerJsdoc(options);

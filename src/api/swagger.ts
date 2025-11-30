import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'AllJobs Scraper API',
      version: '1.0.0',
      description: `
# AllJobs Scraper API Documentation

A comprehensive RESTful API for accessing scraped job listings from alljobs.co.il.

## Features

- **Job Listings**: Retrieve job listings with advanced filtering and pagination
- **Data Export**: Export jobs to CSV or JSON formats
- **Statistics**: Get comprehensive statistics about scraped jobs
- **Database Storage**: All data is stored in SQLite database with automatic deduplication

## Authentication

Currently, the API does not require authentication. This may change in future versions.

## Rate Limiting

No rate limiting is currently implemented. Please use responsibly.

## Data Format

All text fields support Hebrew characters (UTF-8 encoding).
CSV exports include UTF-8 BOM for Excel compatibility.

## Database

The API uses SQLite database located at \`data/alljobs.db\`.
Jobs are automatically deduplicated by \`job_id\` field.
      `,
      contact: {
        name: 'API Support',
        email: 'support@example.com',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
      {
        url: 'https://api.example.com',
        description: 'Production server (example)',
      },
    ],
    tags: [
      {
        name: 'Jobs',
        description: 'Operations related to job listings',
      },
      {
        name: 'Export',
        description: 'Export jobs to various formats',
      },
      {
        name: 'Statistics',
        description: 'Get statistics about scraped jobs',
      },
      {
        name: 'Health',
        description: 'Health check endpoints',
      },
    ],
    components: {
      schemas: {
        JobListing: {
          type: 'object',
          required: ['jobId', 'title', 'company', 'description', 'location', 'jobType', 'applicationUrl'],
          properties: {
            jobId: {
              type: 'string',
              description: 'Unique job identifier from alljobs.co.il',
              example: '8391177',
            },
            title: {
              type: 'string',
              description: 'Job title',
              example: 'דרוש /ה עו"ד בתחום המיסוי המוניציפאלי',
            },
            company: {
              type: 'string',
              description: 'Company name',
              example: 'חברה חסויה',
            },
            description: {
              type: 'string',
              description: 'Job description',
              example: 'משרדנו מתמחה במשפט מנהלי, רשויות מקומיות ומיסוי מוניציפאלי...',
            },
            location: {
              type: 'string',
              description: 'Job location',
              example: 'תל אביב',
            },
            jobType: {
              type: 'string',
              description: 'Type of job position',
              enum: ['משרה מלאה', 'משרה חלקית', 'משמרות', 'Unknown'],
              example: 'משרה מלאה',
            },
            requirements: {
              type: 'string',
              description: 'Job requirements',
              nullable: true,
              example: 'ניסיון של 02 שנים. עדיפות תינתן לבעלי ניסיון ממשרדים העוסקים בארנונה.',
            },
            applicationUrl: {
              type: 'string',
              description: 'URL to apply for the job',
              example: '/Search/UploadSingle.aspx?JobID=8391177',
            },
            postedDate: {
              type: 'string',
              format: 'date',
              description: 'Date when the job was posted',
              nullable: true,
              example: '2025-01-15',
            },
            companyId: {
              type: 'string',
              description: 'Company ID from alljobs.co.il',
              nullable: true,
              example: '12345',
            },
          },
        },
        JobsResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            data: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/JobListing',
              },
            },
            pagination: {
              type: 'object',
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
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            data: {
              type: 'object',
              properties: {
                totalJobs: {
                  type: 'integer',
                  description: 'Total number of jobs in database',
                  example: 540,
                },
                uniqueCompanies: {
                  type: 'integer',
                  description: 'Number of unique companies',
                  example: 120,
                },
                uniqueLocations: {
                  type: 'integer',
                  description: 'Number of unique locations',
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
              },
            },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false,
            },
            error: {
              type: 'string',
              description: 'Error message',
              example: 'Failed to retrieve jobs',
            },
          },
        },
        HealthResponse: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              example: 'ok',
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              example: '2025-11-30T08:30:00.000Z',
            },
          },
        },
      },
      parameters: {
        LimitParam: {
          name: 'limit',
          in: 'query',
          description: 'Maximum number of jobs to return',
          required: false,
          schema: {
            type: 'integer',
            minimum: 1,
            maximum: 1000,
            default: 100,
          },
        },
        OffsetParam: {
          name: 'offset',
          in: 'query',
          description: 'Number of jobs to skip',
          required: false,
          schema: {
            type: 'integer',
            minimum: 0,
            default: 0,
          },
        },
        CompanyFilter: {
          name: 'company',
          in: 'query',
          description: 'Filter jobs by company name (partial match, case-insensitive)',
          required: false,
          schema: {
            type: 'string',
            example: 'חברה',
          },
        },
        LocationFilter: {
          name: 'location',
          in: 'query',
          description: 'Filter jobs by location (partial match, case-insensitive)',
          required: false,
          schema: {
            type: 'string',
            example: 'תל אביב',
          },
        },
        JobTypeFilter: {
          name: 'jobType',
          in: 'query',
          description: 'Filter jobs by job type (exact match)',
          required: false,
          schema: {
            type: 'string',
            enum: ['משרה מלאה', 'משרה חלקית', 'משמרות'],
            example: 'משרה מלאה',
          },
        },
        DateFromFilter: {
          name: 'dateFrom',
          in: 'query',
          description: 'Filter jobs scraped from this date (YYYY-MM-DD format). Filters by created_at field.',
          required: false,
          schema: {
            type: 'string',
            format: 'date',
            example: '2025-11-01',
          },
        },
        DateToFilter: {
          name: 'dateTo',
          in: 'query',
          description: 'Filter jobs scraped until this date (YYYY-MM-DD format). Filters by created_at field.',
          required: false,
          schema: {
            type: 'string',
            format: 'date',
            example: '2025-11-30',
          },
        },
      },
    },
  },
  apis: [
    './src/api/server.ts',
    './dist/api/server.js',
  ], // Path to the API files
};

export const swaggerSpec = swaggerJsdoc(options);


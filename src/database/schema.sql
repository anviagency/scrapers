-- Database schema for AllJobs scraper
-- SQLite database schema

-- Jobs table - stores all scraped job listings
CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    description TEXT NOT NULL,
    location TEXT NOT NULL,
    job_type TEXT NOT NULL,
    requirements TEXT,
    application_url TEXT NOT NULL,
    posted_date TEXT,
    company_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Scraping sessions table - tracks scraping runs
CREATE TABLE IF NOT EXISTS scraping_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    pages_scraped INTEGER DEFAULT 0,
    jobs_found INTEGER DEFAULT 0,
    status TEXT DEFAULT 'running' CHECK(status IN ('running', 'completed', 'failed')),
    error_message TEXT
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_jobs_job_id ON jobs(job_id);
CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company);
CREATE INDEX IF NOT EXISTS idx_jobs_location ON jobs(location);
CREATE INDEX IF NOT EXISTS idx_jobs_job_type ON jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON scraping_sessions(status);


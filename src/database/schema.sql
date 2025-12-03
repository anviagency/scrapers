-- Database schema for Multi-Source Job Scrapers
-- SQLite database schema
-- Supports multiple job sources with complete isolation

-- ============================================
-- AllJobs Tables
-- ============================================

-- Jobs table for AllJobs - stores all scraped job listings from alljobs.co.il
CREATE TABLE IF NOT EXISTS jobs_alljobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    description TEXT NOT NULL,
    location TEXT NOT NULL,
    job_type TEXT NOT NULL,
    category TEXT,
    requirements TEXT,
    target_audience TEXT,
    application_url TEXT NOT NULL,
    posted_date TEXT,
    company_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Scraping sessions table for AllJobs - tracks scraping runs
CREATE TABLE IF NOT EXISTS scraping_sessions_alljobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    pages_scraped INTEGER DEFAULT 0,
    jobs_found INTEGER DEFAULT 0,
    status TEXT DEFAULT 'running' CHECK(status IN ('running', 'completed', 'failed')),
    error_message TEXT
);

-- Indexes for AllJobs tables
CREATE INDEX IF NOT EXISTS idx_jobs_alljobs_job_id ON jobs_alljobs(job_id);
CREATE INDEX IF NOT EXISTS idx_jobs_alljobs_company ON jobs_alljobs(company);
CREATE INDEX IF NOT EXISTS idx_jobs_alljobs_location ON jobs_alljobs(location);
CREATE INDEX IF NOT EXISTS idx_jobs_alljobs_job_type ON jobs_alljobs(job_type);
CREATE INDEX IF NOT EXISTS idx_jobs_alljobs_created_at ON jobs_alljobs(created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_alljobs_status ON scraping_sessions_alljobs(status);

-- ============================================
-- JobMaster Tables
-- ============================================

-- Jobs table for JobMaster - stores all scraped job listings from jobmaster.co.il
CREATE TABLE IF NOT EXISTS jobs_jobmaster (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    description TEXT NOT NULL,
    location TEXT NOT NULL,
    job_type TEXT NOT NULL,
    requirements TEXT,
    target_audience TEXT,
    application_url TEXT NOT NULL,
    posted_date TEXT,
    company_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Scraping sessions table for JobMaster - tracks scraping runs
CREATE TABLE IF NOT EXISTS scraping_sessions_jobmaster (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    pages_scraped INTEGER DEFAULT 0,
    jobs_found INTEGER DEFAULT 0,
    status TEXT DEFAULT 'running' CHECK(status IN ('running', 'completed', 'failed')),
    error_message TEXT
);

-- Indexes for JobMaster tables
CREATE INDEX IF NOT EXISTS idx_jobs_jobmaster_job_id ON jobs_jobmaster(job_id);
CREATE INDEX IF NOT EXISTS idx_jobs_jobmaster_company ON jobs_jobmaster(company);
CREATE INDEX IF NOT EXISTS idx_jobs_jobmaster_location ON jobs_jobmaster(location);
CREATE INDEX IF NOT EXISTS idx_jobs_jobmaster_job_type ON jobs_jobmaster(job_type);
CREATE INDEX IF NOT EXISTS idx_jobs_jobmaster_created_at ON jobs_jobmaster(created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_jobmaster_status ON scraping_sessions_jobmaster(status);

-- ============================================
-- Madlan Real Estate Tables
-- ============================================

-- Listings table for Madlan - stores all scraped real estate listings (sales, rentals, commercial)
CREATE TABLE IF NOT EXISTS listings_madlan (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    price REAL,
    property_type TEXT,
    area_sqm REAL,
    rooms REAL,
    floor TEXT,
    address TEXT,
    city TEXT,
    neighborhood TEXT,
    description TEXT,
    features TEXT, -- JSON array of features
    agent_type TEXT NOT NULL CHECK(agent_type IN ('private', 'agent', 'new_construction')),
    agent_name TEXT,
    agent_phone TEXT,
    listing_type TEXT NOT NULL CHECK(listing_type IN ('sale', 'rent', 'commercial')),
    listing_url TEXT NOT NULL,
    posted_date TEXT,
    updated_date TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Projects table for Madlan - stores new construction projects
CREATE TABLE IF NOT EXISTS projects_madlan (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL UNIQUE,
    project_name TEXT NOT NULL,
    address TEXT,
    developer TEXT,
    floors INTEGER,
    units INTEGER,
    completion_date TEXT,
    price_from REAL,
    price_to REAL,
    price_per_sqm REAL,
    construction_start TEXT,
    construction_end TEXT,
    delivery_dates TEXT, -- JSON array of delivery dates
    project_url TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Images table for Madlan - stores image metadata for listings and projects
CREATE TABLE IF NOT EXISTS images_madlan (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    image_id TEXT NOT NULL UNIQUE,
    listing_id TEXT,
    project_id TEXT,
    image_url TEXT NOT NULL,
    local_path TEXT,
    image_type TEXT NOT NULL CHECK(image_type IN ('listing', 'project')),
    order_index INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (listing_id) REFERENCES listings_madlan(listing_id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects_madlan(project_id) ON DELETE CASCADE
);

-- Scraping sessions table for Madlan - tracks scraping runs
CREATE TABLE IF NOT EXISTS scraping_sessions_madlan (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    pages_scraped INTEGER DEFAULT 0,
    listings_found INTEGER DEFAULT 0,
    projects_found INTEGER DEFAULT 0,
    images_found INTEGER DEFAULT 0,
    status TEXT DEFAULT 'running' CHECK(status IN ('running', 'completed', 'failed')),
    error_message TEXT
);

-- Indexes for Madlan tables
CREATE INDEX IF NOT EXISTS idx_listings_madlan_listing_id ON listings_madlan(listing_id);
CREATE INDEX IF NOT EXISTS idx_listings_madlan_city ON listings_madlan(city);
CREATE INDEX IF NOT EXISTS idx_listings_madlan_listing_type ON listings_madlan(listing_type);
CREATE INDEX IF NOT EXISTS idx_listings_madlan_agent_type ON listings_madlan(agent_type);
CREATE INDEX IF NOT EXISTS idx_listings_madlan_price ON listings_madlan(price);
CREATE INDEX IF NOT EXISTS idx_listings_madlan_created_at ON listings_madlan(created_at);
CREATE INDEX IF NOT EXISTS idx_projects_madlan_project_id ON projects_madlan(project_id);
CREATE INDEX IF NOT EXISTS idx_projects_madlan_developer ON projects_madlan(developer);
CREATE INDEX IF NOT EXISTS idx_images_madlan_listing_id ON images_madlan(listing_id);
CREATE INDEX IF NOT EXISTS idx_images_madlan_project_id ON images_madlan(project_id);
CREATE INDEX IF NOT EXISTS idx_sessions_madlan_status ON scraping_sessions_madlan(status);

-- ============================================
-- Legacy Support (Backward Compatibility)
-- ============================================
-- Keep old table names as views/aliases for backward compatibility
-- These will be removed in a future version

CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    description TEXT NOT NULL,
    location TEXT NOT NULL,
    job_type TEXT NOT NULL,
    category TEXT,
    requirements TEXT,
    target_audience TEXT,
    application_url TEXT NOT NULL,
    posted_date TEXT,
    company_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS scraping_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    pages_scraped INTEGER DEFAULT 0,
    jobs_found INTEGER DEFAULT 0,
    status TEXT DEFAULT 'running' CHECK(status IN ('running', 'completed', 'failed')),
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_jobs_job_id ON jobs(job_id);
CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company);
CREATE INDEX IF NOT EXISTS idx_jobs_location ON jobs(location);
CREATE INDEX IF NOT EXISTS idx_jobs_job_type ON jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON scraping_sessions(status);


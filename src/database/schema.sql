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
-- CarWiz Car Listings Tables
-- ============================================

-- Listings table for CarWiz - stores scraped car listings from carwiz.co.il
-- Complete schema based on GraphQL API structure
CREATE TABLE IF NOT EXISTS listings_carwiz (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- Core identification
    car_id TEXT NOT NULL UNIQUE,
    is_truck INTEGER DEFAULT 0,
    details_view_count INTEGER,
    
    -- Timestamps
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    deleted_at DATETIME,
    
    -- Vehicle details - L1 (core data)
    plate TEXT,
    year INTEGER,
    price REAL,
    original_price REAL,
    previous_price REAL,
    previous_price_update_timestamp DATETIME,
    price_discount INTEGER DEFAULT 0,
    price_difference REAL DEFAULT 0,
    kilometrage INTEGER,
    hand INTEGER,
    original_owner_id INTEGER,
    original_owner_name TEXT,
    future_tradein INTEGER DEFAULT 0,
    parallel_import INTEGER DEFAULT 0,
    condition TEXT,
    
    -- Colors
    color_name TEXT,
    color_name_v2 TEXT,
    color_id TEXT,
    accidents TEXT,
    
    -- Warranty and checks
    warranty TEXT,
    warranty_months INTEGER,
    commitment_to_check TEXT,
    
    -- License details
    license_validity DATETIME,
    license_cost REAL,
    
    -- Financing
    down_payment REAL,
    monthly_payment REAL,
    
    -- Technical specification - L2 (stored as JSON for flexibility)
    specification_json TEXT, -- JSON with makeName, modelName, finishLevel, engineDisplacement, gear, fuelType, etc.
    make_name TEXT, -- Extracted from specification for indexing
    model_name TEXT, -- Extracted from specification for indexing
    finish_level TEXT,
    engine_displacement INTEGER,
    gear TEXT,
    fuel_type TEXT,
    category TEXT,
    segment TEXT,
    doors_count INTEGER,
    seats_count INTEGER,
    
    -- Agency branch details (stored as JSON + key fields extracted)
    agency_branch_json TEXT, -- Full JSON with all branch details
    agency_id INTEGER,
    agency_name TEXT,
    agency_display_name TEXT,
    agency_logo TEXT,
    city TEXT,
    address TEXT,
    area_name TEXT,
    district TEXT,
    longitude REAL,
    latitude REAL,
    phone TEXT,
    virtual_phone TEXT,
    opening_hours_json TEXT, -- JSON with opening hours
    
    -- Images
    images_json TEXT, -- JSON array of images.nodes
    image_urls TEXT, -- Generated full URLs from images.nodes
    jato_images_json TEXT, -- JSON array of jatoImages.nodes
    jato_image_urls TEXT, -- Full URLs from jatoImages.nodes
    
    -- Insights (AI-ready data)
    insights_json TEXT, -- JSON array of insights.nodes
    
    -- Additional fields
    campaign_id TEXT,
    is_allowed_trading INTEGER DEFAULT 1,
    supply_days INTEGER,
    parallel_import_model TEXT,
    truck_spec_json TEXT,
    
    -- Computed/helper fields
    listing_url TEXT,
    
    -- Database timestamps
    db_created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    db_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Scraping sessions table for CarWiz - tracks scraping runs
CREATE TABLE IF NOT EXISTS scraping_sessions_carwiz (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    pages_scraped INTEGER DEFAULT 0,
    listings_found INTEGER DEFAULT 0,
    status TEXT DEFAULT 'running' CHECK(status IN ('running', 'completed', 'failed')),
    error_message TEXT
);

-- Indexes for CarWiz tables
CREATE INDEX IF NOT EXISTS idx_listings_carwiz_car_id ON listings_carwiz(car_id);
CREATE INDEX IF NOT EXISTS idx_listings_carwiz_make_name ON listings_carwiz(make_name);
CREATE INDEX IF NOT EXISTS idx_listings_carwiz_model_name ON listings_carwiz(model_name);
CREATE INDEX IF NOT EXISTS idx_listings_carwiz_year ON listings_carwiz(year);
CREATE INDEX IF NOT EXISTS idx_listings_carwiz_price ON listings_carwiz(price);
CREATE INDEX IF NOT EXISTS idx_listings_carwiz_city ON listings_carwiz(city);
CREATE INDEX IF NOT EXISTS idx_listings_carwiz_agency_id ON listings_carwiz(agency_id);
CREATE INDEX IF NOT EXISTS idx_listings_carwiz_agency_name ON listings_carwiz(agency_name);
CREATE INDEX IF NOT EXISTS idx_listings_carwiz_created_at ON listings_carwiz(created_at);
CREATE INDEX IF NOT EXISTS idx_listings_carwiz_updated_at ON listings_carwiz(updated_at);
CREATE INDEX IF NOT EXISTS idx_listings_carwiz_deleted_at ON listings_carwiz(deleted_at);
CREATE INDEX IF NOT EXISTS idx_listings_carwiz_fuel_type ON listings_carwiz(fuel_type);
CREATE INDEX IF NOT EXISTS idx_listings_carwiz_category ON listings_carwiz(category);
CREATE INDEX IF NOT EXISTS idx_listings_carwiz_hand ON listings_carwiz(hand);
CREATE INDEX IF NOT EXISTS idx_sessions_carwiz_status ON scraping_sessions_carwiz(status);

-- ============================================
-- Freesbe Car Listings Tables
-- ============================================

-- Listings table for Freesbe - stores aggregated car listing data from freesbe.com
CREATE TABLE IF NOT EXISTS listings_freesbe (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    car_id TEXT NOT NULL UNIQUE,
    make TEXT NOT NULL,
    model TEXT NOT NULL,
    year INTEGER,
    version TEXT,
    price REAL,
    monthly_payment REAL,
    mileage INTEGER,
    hand INTEGER, -- יד (1, 2, etc.)
    transmission TEXT, -- אוטומטי, ידני
    fuel_type TEXT, -- בנזין, דיזל, היברידי, חשמלי
    location TEXT,
    city TEXT,
    aggregated_data TEXT, -- JSON object with all aggregated data
    images TEXT, -- JSON array of image URLs
    listing_url TEXT NOT NULL,
    posted_date TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Scraping sessions table for Freesbe - tracks scraping runs
CREATE TABLE IF NOT EXISTS scraping_sessions_freesbe (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    pages_scraped INTEGER DEFAULT 0,
    listings_found INTEGER DEFAULT 0,
    status TEXT DEFAULT 'running' CHECK(status IN ('running', 'completed', 'failed')),
    error_message TEXT
);

-- Indexes for Freesbe tables
CREATE INDEX IF NOT EXISTS idx_listings_freesbe_car_id ON listings_freesbe(car_id);
CREATE INDEX IF NOT EXISTS idx_listings_freesbe_make ON listings_freesbe(make);
CREATE INDEX IF NOT EXISTS idx_listings_freesbe_model ON listings_freesbe(model);
CREATE INDEX IF NOT EXISTS idx_listings_freesbe_year ON listings_freesbe(year);
CREATE INDEX IF NOT EXISTS idx_listings_freesbe_price ON listings_freesbe(price);
CREATE INDEX IF NOT EXISTS idx_listings_freesbe_location ON listings_freesbe(location);
CREATE INDEX IF NOT EXISTS idx_listings_freesbe_created_at ON listings_freesbe(created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_freesbe_status ON scraping_sessions_freesbe(status);

-- ============================================
-- Shared Activities Table (for all scrapers)
-- ============================================

-- Activities table - stores all scraper activities (HTTP requests, parsing, database operations, errors)
-- Shared across all scrapers for centralized monitoring
CREATE TABLE IF NOT EXISTS activities_shared (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    activity_id TEXT NOT NULL UNIQUE,
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    source TEXT NOT NULL CHECK(source IN ('alljobs', 'jobmaster', 'madlan', 'carwiz', 'freesbe')),
    type TEXT NOT NULL CHECK(type IN ('http_request', 'parsing', 'database', 'error', 'proxy')),
    status TEXT NOT NULL CHECK(status IN ('success', 'error', 'warning', 'retry')),
    message TEXT NOT NULL,
    details_json TEXT, -- JSON string of ActivityDetails
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for activities table
CREATE INDEX IF NOT EXISTS idx_activities_shared_timestamp ON activities_shared(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_activities_shared_source ON activities_shared(source);
CREATE INDEX IF NOT EXISTS idx_activities_shared_type ON activities_shared(type);
CREATE INDEX IF NOT EXISTS idx_activities_shared_status ON activities_shared(status);
CREATE INDEX IF NOT EXISTS idx_activities_shared_source_type ON activities_shared(source, type);
CREATE INDEX IF NOT EXISTS idx_activities_shared_source_status ON activities_shared(source, status);

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


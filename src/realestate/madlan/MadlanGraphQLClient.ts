import type { HttpClient } from '../../http/HttpClient';
import type { Logger } from '../../utils/logger';
import { ListingType } from '../../types/MadlanListing';

/**
 * GraphQL API client for Madlan
 * Based on the working implementation from real-estate-scraper
 */
export class MadlanGraphQLClient {
  private readonly httpClient: HttpClient;
  private readonly logger: Logger;
  private readonly apiUrl = 'https://www.madlan.co.il/api2';

  // Headers from the working implementation
  private readonly headers = {
    'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Origin': 'https://www.madlan.co.il',
    'Pragma': 'no-cache',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'X-Original-Hostname': 'www.madlan.co.il',
    'X-Requested-With': 'XMLHttpRequest',
    'X-Source': 'web',
    'accept': '*/*',
    'content-type': 'application/json',
    'sec-ch-ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
  };

  constructor(httpClient: HttpClient, logger: Logger) {
    this.httpClient = httpClient;
    this.logger = logger;
  }

  /**
   * Search for POIs (Points of Interest) - listings and projects
   * Returns list of IDs
   * SIMPLIFIED: Uses tileRanges for all of Israel - more reliable than locationDocId
   * @param listingType - Type of listing (sale, rent, commercial)
   * @param page - Page number (1-based)
   * @param limit - Number of results per page (default: 100)
   */
  async searchPoi(
    listingType: ListingType,
    page: number,
    limit: number = 100
  ): Promise<{ poi: Array<{ id: string; type: string }>; total: number; cursor: any }> {
    const dealType = this.getDealType(listingType);
    const offset = (page - 1) * limit;

    // SIMPLIFIED: Always use tileRanges for all of Israel - most reliable approach
    // locationDocId caused "Invalid response structure" errors
    const isCommercial = listingType === ListingType.COMMERCIAL;
    
    // Build variables - roomsRange/bathsRange only for residential (sale/rent)
    const variables: any = {
      noFee: false,
      dealType,
      numberOfEmployeesRange: [null, null],
      commercialAmenities: {},
      qualityClass: [],
      floorRange: [null, null],
      areaRange: [null, null],
      buildingClass: [],
      sellerType: [],
      generalCondition: [],
      ppmRange: [null, null],
      priceRange: [null, null],
      monthlyTaxRange: [null, null],
      amenities: {},
      sort: [
        {
          field: 'date',
          order: 'desc',
        },
        {
          field: 'geometry',
          order: 'asc',
          reference: null,
          docIds: ['ישראל'],
        },
      ],
      priceDrop: false,
      underPriceEstimation: false,
      isCommercialRealEstate: listingType === ListingType.COMMERCIAL,
      userContext: null,
      poiTypes: ['bulletin', 'project'],
      searchContext: 'marketplace',
      cursor: {
        seenProjects: null,
        bulletinsOffset: 0,
      },
      offset,
      limit,
      abtests: {
        _be_sortMarketplaceByHasAtLeastOneImage: 'modeA',
        _be_sortMarketplaceByDate: 'modeA',
        _be_sortMarketplaceAgeWeight: 'modeA',
      },
      // tileRanges covering all of Israel - this is the most reliable approach
      tileRanges: [
        {
          x1: 156024,
          y1: 105299,
          x2: 157211,
          y2: 108584,
        },
      ],
    };

    // IMPORTANT: Add roomsRange and bathsRange ONLY for residential (sale/rent)
    // Commercial real estate doesn't use these fields
    // NOTE: GraphQL expects [Int] but we send [null, null] which should work
    // If it doesn't work, try removing these fields entirely or sending null
    if (!isCommercial) {
      // Try sending null instead of [null, null] - GraphQL might accept this
      variables.roomsRange = null;
      variables.bathsRange = null;
    }

    // Build query - EXCLUDE roomsRange/bathsRange completely to avoid type mismatch
    // GraphQL schema might not accept [null, null] for [Int] type
    // Use the same query for both commercial and residential - without roomsRange/bathsRange
    const queryVariables = `$dealType: String, $userContext: JSONObject, $abtests: JSONObject, $noFee: Boolean, $priceRange: [Int], $ppmRange: [Int], $monthlyTaxRange: [Int], $buildingClass: [String], $amenities: inputAmenitiesFilter, $generalCondition: [GeneralCondition], $sellerType: [SellerType], $floorRange: [Int], $areaRange: [Int], $tileRanges: [TileRange], $tileRangesExcl: [TileRange], $sort: [SortField], $limit: Int, $offset: Int, $cursor: inputCursor, $poiTypes: [PoiType], $locationDocId: String, $abtests: JSONObject, $searchContext: SearchContext, $underPriceEstimation: Boolean, $priceDrop: Boolean, $isCommercialRealEstate: Boolean, $commercialAmenities: inputCommercialAmenitiesFilter, $qualityClass: [String], $numberOfEmployeesRange: [Float], $creationDaysRange: Int`;
    
    // Build query arguments - EXCLUDE roomsRange/bathsRange completely
    const queryArguments = `noFee: $noFee, dealType: $dealType, userContext: $userContext, abtests: $abtests, priceRange: $priceRange, ppmRange: $ppmRange, monthlyTaxRange: $monthlyTaxRange, buildingClass: $buildingClass, sellerType: $sellerType, floorRange: $floorRange, areaRange: $areaRange, generalCondition: $generalCondition, amenities: $amenities, tileRanges: $tileRanges, tileRangesExcl: $tileRangesExcl, sort: $sort, limit: $limit, offset: $offset, cursor: $cursor, poiTypes: $poiTypes, locationDocId: $locationDocId, abtests: $abtests, searchContext: $searchContext, underPriceEstimation: $underPriceEstimation, priceDrop: $priceDrop, isCommercialRealEstate: $isCommercialRealEstate, commercialAmenities: $commercialAmenities, qualityClass: $qualityClass, numberOfEmployeesRange: $numberOfEmployeesRange, creationDaysRange: $creationDaysRange`;

    const jsonData = {
      operationName: 'searchPoi',
      variables,
      query: `query searchPoi(${queryVariables}) {
  searchPoiV2(${queryArguments}) {
    total
    cursor {
      bulletinsOffset
      projectsOffset
      seenProjects
      __typename
    }
    totalNearby
    lastInGeometryId
    poi {
      id
      type
      __typename
    }
    __typename
  }
}`,
    };

    try {
      // Log request for debugging
      this.logger.debug('Sending GraphQL request', {
        listingType,
        page,
        dealType,
        hasRoomsRange: !!variables.roomsRange,
        roomsRange: variables.roomsRange,
        isCommercial,
      });

      const response = await this.httpClient.post(this.apiUrl, jsonData, this.headers);
      
      // Log full response structure for debugging
      if (!response.data) {
        this.logger.error('Empty response from Madlan API', { listingType, page });
        throw new Error('Empty response from Madlan API');
      }

      // Check for GraphQL errors
      if (response.data.errors) {
        this.logger.error('GraphQL errors in response', {
          errors: response.data.errors,
          listingType,
          page,
          dealType,
          hasRoomsRange: !!variables.roomsRange,
          roomsRange: variables.roomsRange,
        });
        throw new Error(`GraphQL error: ${JSON.stringify(response.data.errors)}`);
      }

      const data = response.data?.data?.searchPoiV2;

      if (!data) {
        this.logger.error('Invalid response structure from searchPoi', {
          responseKeys: Object.keys(response.data || {}),
          dataKeys: Object.keys(response.data?.data || {}),
          listingType,
          page,
        });
        throw new Error('Invalid response structure from searchPoi');
      }

      this.logger.debug('searchPoi success', {
        listingType,
        page,
        total: data.total,
        poiCount: data.poi?.length || 0,
      });

      return {
        poi: data.poi || [],
        total: data.total || 0,
        cursor: data.cursor,
      };
    } catch (error) {
      this.logger.error('Failed to search POI', {
        error: error instanceof Error ? error.message : String(error),
        listingType,
        page,
      });
      throw error;
    }
  }

  /**
   * Get detailed information for POIs by IDs
   */
  async getPoiByIds(ids: Array<{ type: string; id: string }>): Promise<any[]> {
    const jsonData = {
      operationName: 'poiByIds',
      variables: {
        ids,
        userData: null,
      },
      query: `query poiByIds($ids: [PoiIds!], $userData: UserData, $campaignProjectId: String, $includeFrozen: Boolean, $forEdit: Boolean) {
  poiByIds(ids: $ids, userData: $userData, campaignProjectId: $campaignProjectId, includeFrozen: $includeFrozen, forEdit: $forEdit) {
    id
    locationPoint {
      lat
      lng
      __typename
    }
    type
    firstTimeSeen
    addressDetails {
      docId
      city
      borough
      zipcode
      streetName
      neighbourhood
      neighbourhoodDocId
      cityDocId
      resolutionPreferences
      streetNumber
      unitNumber
      district
      parcel
      block
      __typename
    }
    ... on Bulletin {
      userPhoneNumberEdit
      generalCondition
      estimatedPrice
      buildingYear
      availabilityType
      availableDate
      furnitureDetails
      price
      dealType
      area
      beds
      baths
      floor
      floors
      structuredAddress
      description
      url
      originalId
      source
      commonCharges
      monthlyTaxes
      buildingClass
      currency
      leaseTerm
      exposures
      matchScore
      commuteTime
      parkWalkTime
      closestRailStation
      parkName
      bestSchool
      leaseType
      rentalBrokerFee
      virtualTours
      unitPetPolicy
      eventsHistory {
        eventType
        price
        date
        __typename
      }
      images {
        description
        imageUrl
        isFloorplan
        rotation
        __typename
      }
      poc {
        type
        displayNumber
        userId
        ... on BulletinAgent {
          company
          name
          email
          agentId
          officeId
          title
          madadSearchResult
          showOnlyOffice
          exclusivity {
            exclusive
            __typename
          }
          agentContact {
            email
            phone
            imageUrl
            name
            madadCategory
            __typename
          }
          officeContact {
            imageUrl
            name
            title
            __typename
          }
          __typename
        }
        ... on BulletinPrivate {
          contactInfo {
            email
            imageUrl
            name
            phone
            __typename
          }
          __typename
        }
        __typename
      }
      amenities {
        accessible
        airConditioner
        attic
        balcony
        basement
        bikeStorage
        buildingBalcony
        buildingGarden
        buildingLaundry
        buildingPatio
        buildingPenthouse
        buildingRoofdeck
        buildingTerrace
        ceilingFan
        courtyard
        dishwasher
        doorman
        elevator
        fireplace
        furnished
        garage
        garden
        grating
        gym
        heating
        julietBalcony
        pandoorDoors
        parking
        patio
        piedaterreallowed
        pool
        roofDeck
        secureRoom
        storage
        terrace
        unitLaundry
        unitPetPolicy
        unitPetsAllowed
        __typename
      }
      tags {
        bestSchool
        safety
        parkAccess
        quietStreet
        dogPark
        familyFriendly
        bestSecular
        bestReligious
        lightRail
        __typename
      }
      status {
        promoted
        status
        __typename
      }
      __typename
    }
    ... on Project {
      projectName
      projectLogo
      buildingStage
      phoneNumber
      isCommercial
      discount {
        showDiscount
        draftjsDescription
        bannerUrl
        __typename
      }
      previewImage {
        path
        __typename
      }
      dealType
      addressDetails {
        docId
        city
        borough
        zipcode
        streetName
        neighbourhood
        neighbourhoodDocId
        cityDocId
        streetNumber
        unitNumber
        district
        __typename
      }
      apartmentType {
        size
        beds
        apartmentSpecification
        type
        price
        __typename
      }
      architects {
        identifier
        name
        __typename
      }
      bedsRange {
        min
        max
        __typename
      }
      blockDetails {
        buildingsNum
        floorRange {
          min
          max
          __typename
        }
        units
        mishtakenPrice
        urbanRenewal
        __typename
      }
      buildingStage
      developers {
        id
        integrationLevel
        logoPath
        name
        developerLink
        establishmentYear
        inSaleProjects
        finishedProjects
        __typename
      }
      id
      images {
        path
        description
        __typename
      }
      locationPoint {
        lat
        lng
        __typename
      }
      priceRange {
        min
        max
        __typename
      }
      constructors {
        name
        __typename
      }
      projectMessages {
        benefits
        developerDescription
        lastMessages
        mifrat
        __typename
      }
      promotionStatus {
        status
        __typename
      }
      stages {
        buildingStage
        payload {
          message
          __typename
        }
        __typename
      }
      status {
        isNew
        __typename
      }
      type
      __typename
    }
    __typename
  }
}`,
    };

    try {
      const response = await this.httpClient.post(this.apiUrl, jsonData, this.headers);
      const data = response.data?.data?.poiByIds;

      if (!data || !Array.isArray(data)) {
        return [];
      }

      return data;
    } catch (error) {
      this.logger.error('Failed to get POI by IDs', {
        error: error instanceof Error ? error.message : String(error),
        idsCount: ids.length,
      });
      throw error;
    }
  }

  /**
   * Convert ListingType to Madlan dealType
   */
  private getDealType(listingType: ListingType): string {
    switch (listingType) {
      case ListingType.SALE:
        return 'unitBuy';
      case ListingType.RENT:
        return 'unitRent';
      case ListingType.COMMERCIAL:
        return 'commercial';
      default:
        return 'unitBuy';
    }
  }
}


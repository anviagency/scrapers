import type { AxiosResponse } from 'axios';
import type { Logger } from '../../utils/logger';
import type { HttpClient } from '../../http/HttpClient';

/**
 * GraphQL query for fetching car listings from CarWiz
 */
const CARWIZ_GRAPHQL_QUERY = `
  query GetCarPosts($first: Int, $after: Cursor) {
    carPosts(first: $first, after: $after) {
      nodes {
        carId
        isTruck
        detailsViewCount
        warranty
        warrantyMonths
        futureTradein
        commitmentToCheck
        licenseValidity
        licenseCost
        plate
        downPayment
        year
        colorName
        colorNameV2
        price
        kilometrage
        hand
        originalOwnerId
        originalOwnerName
        previousPrice
        priceDiscount
        priceDifference
        createdAt
        updatedAt
        parallelImport
        isAllowedTrading
        monthlyPayment
        specification {
          makeName
          modelName
          year
          finishLevel
          engineDisplacement
          doorsCount
          gear
          seatsCount
          segment
          category
          fuelType
        }
        agencyBranch {
          city
          agencyId
          address
          areaName
          district
          longitude
          latitude
          phone
          virtualPhone
          agency {
            name
            displayName
            logo
          }
        }
        carFiles {
          nodes {
            name
            originalUrl
            type
            angle
            angleIndex
          }
        }
        galleryFiles {
          nodes {
            url
            angle
          }
        }
        insights {
          nodes {
            text
            type
            value
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
      totalCount
    }
  }
`;

/**
 * GraphQL response types
 */
export interface CarWizGraphQLResponse {
  data: {
    carPosts: {
      nodes: CarWizGraphQLNode[];
      pageInfo: {
        hasNextPage: boolean;
        endCursor: string | null;
      };
      totalCount: number;
    };
  };
}

export interface CarWizGraphQLNode {
  carId: string;
  isTruck: boolean;
  detailsViewCount: number;
  warranty: string;
  warrantyMonths: number | null;
  futureTradein: boolean;
  commitmentToCheck: string | null;
  licenseValidity: string | null;
  licenseCost: number | null;
  plate: string | null;
  downPayment: number | null;
  year: number | null;
  colorName: string | null;
  colorNameV2: string | null;
  price: number | null;
  kilometrage: number | null;
  hand: number | null;
  originalOwnerId: number | null;
  originalOwnerName: string | null;
  previousPrice: number | null;
  priceDiscount: boolean;
  priceDifference: number;
  createdAt: string;
  updatedAt: string;
  parallelImport: boolean;
  isAllowedTrading: boolean;
  monthlyPayment: number | null;
  specification: {
    makeName: string | null;
    modelName: string | null;
    year: number | null;
    finishLevel: string | null;
    engineDisplacement: number | null;
    doorsCount: number | null;
    gear: string | null;
    seatsCount: number | null;
    segment: string | null;
    category: string | null;
    fuelType: string | null;
  } | null;
  agencyBranch: {
    city: string | null;
    agencyId: number | null;
    address: string | null;
    areaName: string | null;
    district: string | null;
    longitude: number | null;
    latitude: number | null;
    phone: string | null;
    virtualPhone: string | null;
    agency: {
      name: string | null;
      displayName: string | null;
      logo: string | null;
    } | null;
  } | null;
  carFiles: {
    nodes: Array<{
      name: string;
      originalUrl: string;
      type: string;
      angle: string | null;
      angleIndex: number | null;
    }>;
  } | null;
  galleryFiles: {
    nodes: Array<{
      url: string;
      angle: string | null;
    }>;
  } | null;
  insights: {
    nodes: Array<{
      text: string;
      type: string;
      value: string | null;
    }>;
  } | null;
}

/**
 * GraphQL client for CarWiz API
 */
export class CarWizGraphQLClient {
  private readonly httpClient: HttpClient;
  private readonly logger: Logger;
  private readonly graphqlEndpoint: string = 'https://api.date.carwiz.co.il/api/graphql';

  constructor(httpClient: HttpClient, logger: Logger) {
    this.httpClient = httpClient;
    this.logger = logger;
  }

  /**
   * Fetch car listings from GraphQL API
   * @param first - Number of items to fetch (default: 50)
   * @param after - Cursor for pagination
   * @returns GraphQL response with car listings
   */
  async fetchCarPosts(first: number = 50, after: string | null = null): Promise<CarWizGraphQLResponse> {
    try {
      const variables: Record<string, any> = {
        first,
      };

      if (after) {
        variables.after = after;
      }

      const requestBody = {
        query: CARWIZ_GRAPHQL_QUERY.trim(),
        variables,
      };

      this.logger.debug('GraphQL request', {
        endpoint: this.graphqlEndpoint,
        variables,
        queryLength: requestBody.query.length,
      });

      const response: AxiosResponse<CarWizGraphQLResponse | { errors?: any[] }> = await this.httpClient.post(
        this.graphqlEndpoint,
        requestBody,
        {
          'Content-Type': 'application/json',
          'Origin': 'https://carwiz.co.il',
          'Referer': 'https://carwiz.co.il/',
          'Accept': '*/*',
          'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
        }
      );

      // Check for GraphQL errors
      if ((response.data as any).errors) {
        const errors = (response.data as any).errors;
        this.logger.error('GraphQL API returned errors', {
          errors: JSON.stringify(errors),
          variables,
        });
        throw new Error(`GraphQL errors: ${JSON.stringify(errors)}`);
      }

      if (response.data && (response.data as CarWizGraphQLResponse).data) {
        return response.data as CarWizGraphQLResponse;
      }

      throw new Error('Invalid GraphQL response structure');
    } catch (error) {
      this.logger.error('Failed to fetch car posts from GraphQL API', {
        error: error instanceof Error ? error.message : String(error),
        first,
        after,
      });
      throw error;
    }
  }
}

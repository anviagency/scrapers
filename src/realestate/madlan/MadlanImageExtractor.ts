import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import type { Logger } from '../../utils/logger';
import type { MadlanImage } from '../../types/MadlanImage';
import { ImageType } from '../../types/MadlanImage';

/**
 * Extracts and downloads images from Madlan listings and projects
 */
export class MadlanImageExtractor {
  private readonly logger: Logger;
  private readonly imagesDir: string;

  constructor(logger: Logger, imagesDir: string = 'data/madlan-images') {
    this.logger = logger;
    this.imagesDir = imagesDir;
    
    // Ensure images directory exists
    if (!fs.existsSync(this.imagesDir)) {
      fs.mkdirSync(this.imagesDir, { recursive: true });
    }
  }

  /**
   * Downloads images and returns metadata
   * @param imageUrls - Array of image URLs
   * @param listingId - Listing ID (for listing images)
   * @param projectId - Project ID (for project images)
   * @returns Array of image metadata
   */
  async downloadImages(
    imageUrls: string[],
    listingId?: string,
    projectId?: string
  ): Promise<MadlanImage[]> {
    const images: MadlanImage[] = [];

    for (let i = 0; i < imageUrls.length; i++) {
      const imageUrl = imageUrls[i];
      try {
        const imageMetadata = await this.downloadImage(
          imageUrl,
          listingId,
          projectId,
          i
        );
        if (imageMetadata) {
          images.push(imageMetadata);
        }
      } catch (error) {
        this.logger.warn('Failed to download image', {
          imageUrl,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return images;
  }

  /**
   * Downloads a single image
   * @param imageUrl - URL of the image
   * @param listingId - Listing ID (optional)
   * @param projectId - Project ID (optional)
   * @param orderIndex - Order index in gallery
   * @returns Image metadata or null if download fails
   */
  private async downloadImage(
    imageUrl: string,
    listingId?: string,
    projectId?: string,
    orderIndex: number = 0
  ): Promise<MadlanImage | null> {
    try {
      // Generate image ID from URL
      const imageId = this.generateImageId(imageUrl, listingId, projectId, orderIndex);
      
      // Determine image type
      const imageType = listingId ? ImageType.LISTING : ImageType.PROJECT;

      // Generate local file path
      const filename = `${imageId}.jpg`;
      const localPath = path.join(this.imagesDir, filename);

      // Download image
      await this.downloadFile(imageUrl, localPath);

      return {
        imageId,
        listingId: listingId || null,
        projectId: projectId || null,
        imageUrl,
        localPath,
        imageType,
        orderIndex,
      };
    } catch (error) {
      this.logger.error('Failed to download image', {
        imageUrl,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Downloads a file from URL
   * @param url - URL to download from
   * @param filePath - Local file path to save to
   */
  private async downloadFile(url: string, filePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;
      
      const file = fs.createWriteStream(filePath);
      
      protocol.get(url, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          // Handle redirect
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            file.close();
            fs.unlinkSync(filePath);
            this.downloadFile(redirectUrl, filePath).then(resolve).catch(reject);
            return;
          }
        }

        if (response.statusCode !== 200) {
          file.close();
          fs.unlinkSync(filePath);
          reject(new Error(`Failed to download: ${response.statusCode}`));
          return;
        }

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          resolve();
        });
      }).on('error', (error) => {
        file.close();
        fs.unlinkSync(filePath);
        reject(error);
      });
    });
  }

  /**
   * Generates a unique image ID
   * @param imageUrl - Image URL
   * @param listingId - Listing ID (optional)
   * @param projectId - Project ID (optional)
   * @param orderIndex - Order index
   * @returns Image ID
   */
  private generateImageId(
    imageUrl: string,
    listingId?: string,
    projectId?: string,
    orderIndex: number = 0
  ): string {
    const baseId = listingId || projectId || 'unknown';
    const urlHash = imageUrl.split('/').pop()?.split('?')[0] || 'img';
    return `${baseId}_${urlHash}_${orderIndex}`;
  }
}


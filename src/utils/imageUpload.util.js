import axios from 'axios';
import FormData from 'form-data';
import path from 'path'; // For path.extname
import config from '../config/index.js';
import AppError from './AppError.js'; 

const uploadImageToImgBBFromBuffer = async (fileBuffer, originalFilename) => {
    if (!config.imgbbApiKey) {
        console.error('ImgBB API Key is not configured. Cannot upload image.');
        throw new AppError('Image upload service is not configured.', 500);
    }

    try {
        const fileExtension = path.extname(originalFilename) || '.jpg'; // Default to .jpg if no extension
        const filenameForUpload = `image${Date.now()}${fileExtension}`; // Add timestamp for uniqueness

        const formData = new FormData();
        formData.append('image', fileBuffer, { filename: filenameForUpload });

        const response = await axios.post(
            `https://api.imgbb.com/1/upload?key=${config.imgbbApiKey}`,
            formData,
            {
                headers: {
                    ...formData.getHeaders(),
                },
                // Add a timeout for the request
                timeout: 15000, // 15 seconds timeout
            }
        );

        if (response.data && response.data.success) {
            return response.data.data.url;
        } else {
            console.error('ImgBB upload failed. Response:', response.data);
            const errorMessage = response.data?.error?.message || 'ImgBB upload failed due to an unknown error.';
            throw new AppError(`ImgBB upload failed: ${errorMessage}`, response.data?.status_code || 500);
        }
    } catch (error) {
        if (error instanceof AppError) throw error; // Re-throw AppError instances

        console.error('Error uploading to ImgBB:', error.isAxiosError ? error.message : error);
        if (error.isAxiosError) {
            if (error.response) {
                // The request was made and the server responded with a status code
                // that falls out of the range of 2xx
                console.error('ImgBB Error Data:', error.response.data);
                console.error('ImgBB Error Status:', error.response.status);
                const detail = error.response.data?.error?.message || error.message;
                throw new AppError(`ImgBB upload service error: ${detail}`, error.response.status || 500);
            } else if (error.request) {
                // The request was made but no response was received
                throw new AppError('No response from ImgBB upload service. Check network or ImgBB status.', 504); // Gateway Timeout
            } else {
                // Something happened in setting up the request that triggered an Error
                throw new AppError(`Error setting up ImgBB upload request: ${error.message}`, 500);
            }
        }
        throw new AppError('Failed to upload image due to an internal error.', 500);
    }
};

export { uploadImageToImgBBFromBuffer };
// src/middlewares/uploadImage.middleware.js

import multer from 'multer';
import { uploadImageToImgBBFromBuffer } from '../utils/imageUpload.util.js';
import AppError from '../utils/AppError.js';

// Multer configuration that uses memory storage
const storage = multer.memoryStorage();

const imageFileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new AppError('Not an image! Please upload only images.', 400), false);
    }
};

const MAX_FILE_SIZE_MB = 5;
const upload = multer({
    storage: storage,
    fileFilter: imageFileFilter,
    limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 }
});

const uploadImageMiddleware = (fieldName, type = 'single', maxCount = 5) => {
    let multerUploadFunction;
    if (type === 'single') {
        multerUploadFunction = upload.single(fieldName);
    } else if (type === 'array') {
        multerUploadFunction = upload.array(fieldName, maxCount);
    } else if (type === 'fields') {
        multerUploadFunction = upload.fields(fieldName);
    } else {
        throw new Error("Invalid upload type specified for uploadImageMiddleware. Use 'single', 'array', or 'fields'.");
    }

    return [
        (req, res, next) => {
            multerUploadFunction(req, res, (err) => {
                if (err instanceof multer.MulterError) {
                    console.error("[UPLOAD_MIDDLEWARE_DEBUG] MulterError:", err.code, err.message);
                    if (err.code === 'LIMIT_FILE_SIZE') {
                        return next(new AppError(`File too large. Maximum size is ${MAX_FILE_SIZE_MB}MB.`, 400));
                    }
                    return next(new AppError(`Multer error: ${err.message}`, 400));
                } else if (err) {
                    console.error("[UPLOAD_MIDDLEWARE_DEBUG] General Multer Callback Error:", err.message);
                    return next(err);
                }
                next();
            });
        },
        async (req, res, next) => {
            let filesToProcess = [];
            let uploadedUrlsForCompatibility = []; 

            if (type === 'single' && req.file) {
                filesToProcess.push(req.file);
            } else if (type === 'array' && req.files && Array.isArray(req.files)) {
                filesToProcess = req.files;
            } else if (type === 'fields' && req.files && typeof req.files === 'object') {
                for (const key in req.files) {
                    if (Object.prototype.hasOwnProperty.call(req.files, key) && Array.isArray(req.files[key]) && req.files[key].length > 0) {
                        filesToProcess.push(req.files[key][0]); // Taking only the first file for each field
                    }
                }
            }
            
            if (filesToProcess.length === 0) {
                return next();
            }
          
            const uploadPromises = filesToProcess.map(async (file) => {
                try {
                    const imageUrl = await uploadImageToImgBBFromBuffer(file.buffer, file.originalname);
                    file.fileUrl = imageUrl; 
                    uploadedUrlsForCompatibility.push(imageUrl);
                } catch (uploadError) {
                    file.uploadError = uploadError.message; 
                    throw new AppError(`Failed to upload ${file.fieldname} image: ${uploadError.message}`, 500); 
                }
            });

            try {
                await Promise.all(uploadPromises); 
                
                if (type === 'single') {
                    req.fileUrl = uploadedUrlsForCompatibility.length > 0 ? uploadedUrlsForCompatibility[0] : undefined;
                } else if (type === 'array') {
                    req.fileUrls = uploadedUrlsForCompatibility;
                }
                
                next();
            } catch (error) {
                console.error("[UPLOAD_MIDDLEWARE_DEBUG] Error in ImgBB upload phase:", error.message);
                next(error);
            }
        }
    ];
};

export default uploadImageMiddleware;
export const uploadApplicantDocument = async (req, res, next) => {
    try {
        const applicationProfileId = req.applicantProfile.id;
        const { documentType } = req.body; // We get the type from the form data
        
        // The URL comes from the uploadImageMiddleware
        const fileUrl = req.fileUrl; 
        
        // The file object from multer contains other details
        const file = req.file;

        if (!documentType || !fileUrl || !file) {
            throw new AppError('Document type, and a file are required for upload.', 400);
        }

        const documentData = {
            documentType: documentType,
            fileUrl: fileUrl,
            fileName: file.originalname,
            fileType: file.mimetype,
            fileSize: file.size,
        };

        const updatedProfile = await ApplicationProfileService.saveOrUpdateSingleDocument(applicationProfileId, documentData);

        res.status(200).json({
            status: 'success',
            message: `${documentType.replace(/_/g, ' ')} uploaded successfully.`,
            data: { profile: updatedProfile }
        });
    } catch (error) {
        next(error);
    }
};
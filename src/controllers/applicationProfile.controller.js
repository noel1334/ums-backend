
import * as ApplicationProfileService from '../services/applicationProfile.service.js';
import AppError from '../utils/AppError.js';
import { updateProfileAndAddToScreening } from '../services/applicationProfile.service.js';
import  catchAsync  from '../utils/catchAsync.js';

export const createApplicantProfile = async (req, res, next) => {
    try {
        const newProfile = await ApplicationProfileService.createApplicantProfile(req.body);
        res.status(201).json({
            status: 'success',
            message: 'Application profile initiated. Please log in to continue.',
            data: { profile: newProfile } // Or redirect to login
        });
    } catch (error) {
        next(error);
    }
};

// Applicant gets their own profile (protected by authenticateApplicantToken)
export const getMyApplicationProfile = async (req, res, next) => {
    try {
        // req.applicantProfile.id is set by authenticateApplicantToken middleware
        const profile = await ApplicationProfileService.getMyApplicationProfile(req.applicantProfile.id);
        res.status(200).json({ status: 'success', data: { profile } });
    } catch (error) {
        next(error);
    }
};

export const getAllApplicationProfilesAsAdmin = async (req, res, next) => {
    try {
        // The service function will handle the query parameters (req.query)
        const result = await ApplicationProfileService.getAllApplicationProfiles(req.query);
        res.status(200).json({ status: 'success', data: result });
    } catch (error) {
        next(error);
    }
};

// Applicant updates their own profile (protected by authenticateApplicantToken)
export const updateMyApplicationProfile = async (req, res, next) => {
    try {
        if (Object.keys(req.body).length === 0) {
            return next(new AppError('No data provided for update.', 400));
        }
        const updatedProfile = await ApplicationProfileService.updateMyApplicationProfile(req.applicantProfile.id, req.body);
        res.status(200).json({
            status: 'success',
            message: 'Application profile updated successfully.',
            data: { profile: updatedProfile }
        });
    } catch (error) {
        next(error);
    }
};

// Applicant submits their application
export const submitMyApplicationProfile = async (req, res, next) => {
    try {
        const submittedProfile = await ApplicationProfileService.submitApplicationProfile(req.applicantProfile.id);
        res.status(200).json({
            status: 'success',
            message: 'Application submitted successfully for review.',
            data: { profile: submittedProfile }
        });
    } catch (error) {
        next(error);
    }
};

// --- Admin/ICT Operations (Example - Get any profile by ID) ---
export const getApplicationProfileByIdAsAdmin = async (req, res, next) => {
    try {
        const profileId = req.params.id;
        // The service function is the same one an applicant uses to get their own profile
        const profile = await ApplicationProfileService.getMyApplicationProfile(profileId);
        res.status(200).json({ status: 'success', data: { profile } });
    } catch (error) {
        next(error);
    }
};

export const saveApplicationStep = async (req, res, next) => {
    try {
        const { step } = req.params; // e.g., 'bio-data', 'next-of-kin'
        const applicationProfileId = req.applicantProfile.id; // From auth middleware

        if (Object.keys(req.body).length === 0) {
            return next(new AppError('No data provided for this step.', 400));
        }

        // Call the new service function to handle the logic
        const updatedProfile = await ApplicationProfileService.saveOrUpdateApplicationStep(
            applicationProfileId,
            step,
            req.body
        );

        res.status(200).json({
            status: 'success',
            message: `Step '${step}' saved successfully.`,
            data: { profile: updatedProfile } // Return the full, updated profile
        });

    } catch (error) {
        next(error); // Pass errors to your global error handler
    }
};

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

export const updateProfileByAdmin = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const payload = req.body;

    const updatedProfile = await updateProfileAndAddToScreening(parseInt(id, 10), payload);

    res.status(200).json({
        status: 'success',
        message: "Profile updated and added to physical screening list successfully.",
        data: {
            profile: updatedProfile,
        },
    });
});
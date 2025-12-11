// src/controllers/applicant.controller.js
import * as ApplicationProfileService from '../services/applicationProfile.service.js';
import * as authService from '../services/auth.service.js'; // NEW: Import auth service for login
import prisma from '../config/prisma.js'; // NEW: Import prisma for direct DB queries in controller for validation
import AppError from '../utils/AppError.js';
import { DegreeType } from '../generated/prisma/index.js'; // Import DegreeType enum

// Controller for ND/NCE self-registration
export const registerNdNceApplicant = async (req, res, next) => {
    try {
        const { email, password, targetProgramId } = req.body;

        if (!email || !password || !targetProgramId) {
            return next(new AppError('Email, password, and desired program are required.', 400));
        }

        const programIdNum = parseInt(targetProgramId, 10);
        if (isNaN(programIdNum)) {
            return next(new AppError('Invalid program ID format.', 400));
        }

        // Fetch the program to perform specific validation before calling the service
        const programDetails = await prisma.program.findUnique({
            where: { id: programIdNum },
            select: { name: true, degreeType: true, jambRequired: true, onlineScreeningRequired: true }
        });

        if (!programDetails) {
            return next(new AppError('Selected program not found.', 404));
        }
        if (programDetails.jambRequired) {
            return next(new AppError(`Program '${programDetails.name}' requires a JAMB registration. Please use the appropriate JAMB application portal.`, 400));
        }
        // Include HND here as it can also be a direct entry option with online screening
        if (![DegreeType.ND, DegreeType.NCE, DegreeType.HND].includes(programDetails.degreeType)) {
            return next(new AppError(`Selected program '${programDetails.name}' is not an ND, NCE, or HND program suitable for this registration path.`, 400));
        }
        if (!programDetails.onlineScreeningRequired) {
             return next(new AppError(`Selected program '${programDetails.name}' does not require online screening. Please use the postgraduate/other direct entry portal.`, 400));
        }

        const newApplicantProfile = await ApplicationProfileService.createApplicantProfileDirect(
            email, password, targetProgramId
        );

        res.status(201).json({
            status: 'success',
            message: 'ND/NCE application account created successfully. Please log in to complete your profile and screening.',
            data: { applicantProfileId: newApplicantProfile.id, email: newApplicantProfile.email }
        });
    } catch (error) {
        next(error);
    }
};

// Controller for Postgraduate/Certificate self-registration
export const registerPostgraduateCertificateApplicant = async (req, res, next) => {
    try {
        const { email, password, targetProgramId } = req.body;

        if (!email || !password || !targetProgramId) {
            return next(new AppError('Email, password, and desired program are required.', 400));
        }

        const programIdNum = parseInt(targetProgramId, 10);
        if (isNaN(programIdNum)) {
            return next(new AppError('Invalid program ID format.', 400));
        }

        const programDetails = await prisma.program.findUnique({
            where: { id: programIdNum },
            select: { name: true, degreeType: true, jambRequired: true, onlineScreeningRequired: true }
        });

        if (!programDetails) {
            return next(new AppError('Selected program not found.', 404));
        }
        if (programDetails.jambRequired) {
            return next(new AppError(`Program '${programDetails.name}' requires a JAMB registration. Please use the appropriate JAMB application portal.`, 400));
        }
        if (![DegreeType.POSTGRADUATE_DIPLOMA, DegreeType.MASTERS, DegreeType.PHD, DegreeType.CERTIFICATE, DegreeType.DIPLOMA].includes(programDetails.degreeType)) {
            return next(new AppError(`Selected program '${programDetails.name}' is not a Postgraduate, Certificate, or Diploma program suitable for this registration path.`, 400));
        }
        if (programDetails.onlineScreeningRequired) {
            return next(new AppError(`Selected program '${programDetails.name}' requires online screening. Please use the ND/NCE or Undergraduate direct entry portal.`, 400));
        }

        const newApplicantProfile = await ApplicationProfileService.createApplicantProfileDirect(
            email, password, targetProgramId
        );

        res.status(201).json({
            status: 'success',
            message: 'Postgraduate/Certificate application account created successfully. Please log in to complete your profile.',
            data: { applicantProfileId: newApplicantProfile.id, email: newApplicantProfile.email }
        });
    } catch (error) {
        next(error);
    }
};

// Controller for applicant login (wraps authService.loginApplicantScreening)
export const loginApplicantScreening = async (req, res, next) => {
    try {
        const { identifier, password } = req.body;
        const result = await authService.loginApplicantScreening(identifier, password);
        res.status(200).json({ status: 'success', data: result });
    } catch (error) {
        next(error);
    }
};

// You might also add other applicant-related controller functions here, e.g., for profile management:
export const getMyApplicationProfile = async (req, res, next) => {
    try {
        const applicantProfileId = req.user.userId; // Assuming userId in token is applicationProfileId
        const profile = await ApplicationProfileService.getMyApplicationProfile(applicantProfileId);
        res.status(200).json({ status: 'success', data: profile });
    } catch (error) {
        next(error);
    }
};

export const updateMyApplicationProfile = async (req, res, next) => {
    try {
        const applicantProfileId = req.user.userId;
        const updatedProfile = await ApplicationProfileService.updateMyApplicationProfile(applicantProfileId, req.body);
        res.status(200).json({ status: 'success', data: updatedProfile });
    } catch (error) {
        next(error);
    }
};

export const submitApplication = async (req, res, next) => {
    try {
        const applicantProfileId = req.user.userId;
        const submittedProfile = await ApplicationProfileService.submitApplicationProfile(applicantProfileId);
        res.status(200).json({ status: 'success', data: submittedProfile });
    } catch (error) {
        next(error);
    }
};
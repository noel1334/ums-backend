import * as ApplicationProfileService from '../services/applicationProfile.service.js';
import * as authService from '../services/auth.service.js';
import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import { DegreeType } from '../generated/prisma/index.js';

// Controller for ND/NCE self-registration
export const registerNdNceApplicant = async (req, res, next) => {
    try {
        const { email, password, targetProgramId, jambRegNo, firstName, lastName } = req.body; // ADD firstName, lastName

        if (!email || !password || !targetProgramId || !firstName || !lastName) { // firstName and lastName now required for this portal
            return next(new AppError('Email, password, first name, last name, and desired program are required.', 400));
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
        if (![DegreeType.ND, DegreeType.NCE, DegreeType.HND].includes(programDetails.degreeType)) {
            return next(new AppError(`Selected program '${programDetails.name}' is not an ND, NCE, or HND program suitable for this registration path.`, 400));
        }
        if (!programDetails.onlineScreeningRequired) {
             return next(new AppError(`Selected program '${programDetails.name}' does not require online screening. Please use the postgraduate/other direct entry portal.`, 400));
        }

        const newApplicantProfile = await ApplicationProfileService.createApplicantProfileDirect(
            email, password, targetProgramId, jambRegNo, firstName, lastName // PASS firstName, lastName
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

// MODIFIED: Controller for Postgraduate/Certificate self-registration (NO online screening)
export const registerPostgraduateCertificateApplicant = async (req, res, next) => {
    try {
        const { email, password, targetProgramId, jambRegNo, firstName, lastName } = req.body; // ADD firstName, lastName

        if (!email || !password || !targetProgramId || !firstName || !lastName) { // firstName and lastName now required for this portal
            return next(new AppError('Email, password, first name, last name, and desired program are required.', 400));
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
            return next(new AppError(`Selected program '${programDetails.name}' requires online screening. Please use the ND/NCE or Undergraduate direct entry portal, or the dedicated Postgraduate Online Screening portal.`, 400));
        }

        const newApplicantProfile = await ApplicationProfileService.createApplicantProfileDirect(
            email, password, targetProgramId, jambRegNo, firstName, lastName // PASS firstName, lastName
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


// MODIFIED: Controller for Postgraduate/Master's/PhD/Certificate/Diploma self-registration WITH online screening
export const registerPostgraduateWithOnlineScreeningApplicant = async (req, res, next) => {
    try {
        const { email, password, targetProgramId, jambRegNo, firstName, lastName } = req.body; // ADD firstName, lastName

        if (!email || !password || !targetProgramId || !firstName || !lastName) { // firstName and lastName now required for this portal
            return next(new AppError('Email, password, first name, last name, and desired program are required.', 400));
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
            return next(new AppError(`Selected program '${programDetails.name}' is not a Postgraduate, Certificate, or Diploma program suitable for this online screening registration path.`, 400));
        }
        if (!programDetails.onlineScreeningRequired) {
            return next(new AppError(`Selected program '${programDetails.name}' does not require online screening. Please use the standard Postgraduate/Other Direct Entry portal.`, 400));
        }

        const newApplicantProfile = await ApplicationProfileService.createApplicantProfileDirect(
            email, password, targetProgramId, jambRegNo, firstName, lastName // PASS firstName, lastName
        );

        res.status(201).json({
            status: 'success',
            message: 'Postgraduate application account with online screening created successfully. Please log in to complete your profile and screening.',
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

/*
   The `createApplicantProfileDirect` function from the service is imported implicitly via ApplicationProfileService.
   The original context had a duplicate definition of createApplicantProfileDirect;
   it should reside within ApplicationProfileService (as shown in the provided service file)
   and imported/used by controllers via `ApplicationProfileService.createApplicantProfileDirect`.
*/
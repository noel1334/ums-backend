import * as AcceptanceFeeListService from '../services/acceptanceFeeList.service.js';
import AppError from '../utils/AppError.js';

export const createAcceptanceFee = async (req, res, next) => {
    try {
        // Add any specific validation for req.body if needed, though service does main validation
        const newFee = await AcceptanceFeeListService.createAcceptanceFee(req.body);
        res.status(201).json({
            status: 'success',
            message: 'Acceptance fee item created successfully.',
            data: { acceptanceFee: newFee }
        });
    } catch (error) {
        next(error);
    }
};

export const getAllAcceptanceFees = async (req, res, next) => {
    try {
        const result = await AcceptanceFeeListService.getAllAcceptanceFees(req.query);
        res.status(200).json({
            status: 'success',
            data: result
        });
    } catch (error) {
        next(error);
    }
};

export const getAcceptanceFeeById = async (req, res, next) => {
    try {
        const feeId = req.params.id;
        if (!feeId) {
            return next(new AppError('Acceptance Fee ID is required in the path.', 400));
        }
        const fee = await AcceptanceFeeListService.getAcceptanceFeeById(feeId);
        res.status(200).json({
            status: 'success',
            data: { acceptanceFee: fee }
        });
    } catch (error) {
        next(error);
    }
};

export const updateAcceptanceFee = async (req, res, next) => {
    try {
        const feeId = req.params.id;
        if (!feeId) {
            return next(new AppError('Acceptance Fee ID is required in the path.', 400));
        }
        if (Object.keys(req.body).length === 0) {
            return next(new AppError('No data provided for update.', 400));
        }
        const updatedFee = await AcceptanceFeeListService.updateAcceptanceFee(feeId, req.body);
        res.status(200).json({
            status: 'success',
            message: 'Acceptance fee item updated successfully.',
            data: { acceptanceFee: updatedFee }
        });
    } catch (error) {
        next(error);
    }
};

export const deleteAcceptanceFee = async (req, res, next) => {
    try {
        const feeId = req.params.id;
        if (!feeId) {
            return next(new AppError('Acceptance Fee ID is required in the path.', 400));
        }
        const result = await AcceptanceFeeListService.deleteAcceptanceFee(feeId);
        res.status(200).json({ // Or 204 if you prefer no content in the body for delete
            status: 'success',
            message: result.message
        });
    } catch (error) {
        next(error);
    }
};

export const getMyApplicableAcceptanceFee = async (req, res, next) => {
    try {
        // ... (applicantProfile check)

        const feeData = await AcceptanceFeeListService.getApplicableAcceptanceFee(req.applicantProfile.id);

        // SCENARIO 1: Acceptance fee has already been paid
        if (feeData && feeData.message && feeData.fee === null) {
            return res.status(200).json({
                status: 'info',
                message: feeData.message,
                data: { acceptanceFee: null } // Here, acceptanceFee is explicitly null
            });
        }

        // SCENARIO 2: An actual fee object was found
        // If feeData is the actual fee object
        res.status(200).json({
            status: 'success',
            data: { acceptanceFee: feeData } // Here, acceptanceFee is set to feeData
        });

    } catch (error) {
        next(error);
    }
};

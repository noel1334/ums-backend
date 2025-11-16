
import * as ICTStaffService from '../services/ictStaff.service.js';
import AppError from '../utils/AppError.js';

export const createICTStaff = async (req, res, next) => {
    try {
        // req.body contains the text fields from FormData
        // req.fileUrl contains the image URL from your upload middleware
        const staffData = { ...req.body };

        if (req.fileUrl) {
            staffData.profileImg = req.fileUrl;
        }

        // --- THE FIX IS HERE ---
        // You must capture the returned value from the service into a variable.
        const newStaff = await ICTStaffService.createICTStaff(staffData);

        res.status(201).json({
            status: 'success',
            message: 'ICT Staff created successfully.',
            data: {
                staff: newStaff // Now the 'newStaff' variable exists and can be sent in the response.
            },
        });
    } catch (error) {
        next(error); // Pass errors to the global error handler
    }
};

// You can add your other controller functions here as well...

export const getAllICTStaff = async (req, res, next) => {
    try {
        const result = await ICTStaffService.getAllICTStaff(req.query);
        res.status(200).json({
            status: 'success',
            data: result,
        });
    } catch (error) {
        next(error);
    }
};

export const getICTStaffById = async (req, res, next) => {
    try {
        const staff = await ICTStaffService.getICTStaffById(req.params.id);
        res.status(200).json({
            status: 'success',
            data: { staff },
        });
    } catch (error) {
        next(error);
    }
};

export const updateICTStaff = async (req, res, next) => {
    try {
        const updateData = { ...req.body };
        if (req.fileUrl) {
            updateData.profileImg = req.fileUrl;
        }
        if (Object.keys(updateData).length === 0) {
            return next(new AppError('No data provided for update.', 400));
        }

        const updatedStaff = await ICTStaffService.updateICTStaff(req.params.id, updateData, req.user);
        res.status(200).json({
            status: 'success',
            message: 'ICT Staff updated successfully.',
            data: { staff: updatedStaff },
        });
    } catch (error) {
        next(error);
    }
};


export const deleteICTStaff = async (req, res, next) => {
    try {
        const result = await ICTStaffService.deleteICTStaff(req.params.id);
        res.status(200).json({ // Or 204 with no content
            status: 'success',
            message: result.message,
        });
    } catch (error) {
        next(error);
    }
};

// Get profile of the currently logged-in ICT staff
export const getMyICTProfile = async (req, res, next) => {
    try {
        const staff = await ICTStaffService.getICTStaffById(req.user.id); // req.user.id from auth
        res.status(200).json({
            status: 'success',
            data: { staff },
        });
    } catch (error) {
        next(error);
    }
};

export const updateMyICTProfile = async (req, res, next) => {
    try {
       if (Object.keys(req.body).length === 0 && !req.fileUrl) {
            return next(new AppError('No data or image provided for update.', 400));
        }
        
        const updateData = { ...req.body };
        if (req.fileUrl) {
            updateData.profileImg = req.fileUrl;
        }
        
        // Pass the correct `updateData` object to the service
        const updatedStaff = await ICTStaffService.updateICTStaff(req.user.id, updateData, req.user);
        
        res.status(200).json({
            status: 'success',
            message: 'Your profile updated successfully',
            data: { staff: updatedStaff },
        });
    } catch (error) {
        next(error);
    }
};
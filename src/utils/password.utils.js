import bcrypt from 'bcryptjs';

export const hashPassword = async (password) => {
    try {
        const salt = await bcrypt.genSalt(10);
        return await bcrypt.hash(password, salt);
    } catch (error) {
        console.error("Error hashing password:", error);
        throw new Error("Password hashing failed"); // Or a custom AppError
    }
};

export const comparePassword = async (candidatePassword, hashedPassword) => {
    try {
        return await bcrypt.compare(candidatePassword, hashedPassword);
    } catch (error) {
        console.error("Error comparing password:", error);
        throw new Error("Password comparison failed"); // Or a custom AppError
    }
};
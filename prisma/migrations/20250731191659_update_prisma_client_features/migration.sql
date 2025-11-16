-- CreateTable
CREATE TABLE `Admin` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191) NOT NULL,
    `password` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `profileImg` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `role` VARCHAR(191) NULL DEFAULT 'ADMIN',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `isPermittedToAddAdmin` BOOLEAN NOT NULL DEFAULT false,
    `location` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Admin_email_key`(`email`),
    UNIQUE INDEX `Admin_phone_key`(`phone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Student` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `regNo` VARCHAR(191) NULL,
    `jambRegNo` VARCHAR(191) NULL,
    `name` VARCHAR(255) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `entryMode` ENUM('UTME', 'DIRECT_ENTRY', 'TRANSFER') NOT NULL,
    `yearOfAdmission` INTEGER NOT NULL,
    `admissionSeasonId` INTEGER NOT NULL,
    `admissionSemesterId` INTEGER NOT NULL,
    `departmentId` INTEGER NOT NULL,
    `programId` INTEGER NOT NULL,
    `entryLevelId` INTEGER NOT NULL,
    `currentLevelId` INTEGER NOT NULL,
    `isGraduated` BOOLEAN NOT NULL DEFAULT false,
    `graduationSeasonId` INTEGER NULL,
    `graduationSemesterId` INTEGER NULL,
    `currentSeasonId` INTEGER NULL,
    `currentSemesterId` INTEGER NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `password` VARCHAR(255) NOT NULL,
    `profileImg` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Student_regNo_key`(`regNo`),
    UNIQUE INDEX `Student_jambRegNo_key`(`jambRegNo`),
    UNIQUE INDEX `Student_email_key`(`email`),
    INDEX `Student_name_idx`(`name`),
    INDEX `Student_email_idx`(`email`),
    INDEX `Student_regNo_idx`(`regNo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StudentDetails` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `studentId` INTEGER NOT NULL,
    `dob` DATETIME(3) NULL,
    `gender` ENUM('MALE', 'FEMALE') NOT NULL,
    `address` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `guardianName` VARCHAR(191) NULL,
    `guardianPhone` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `StudentDetails_studentId_key`(`studentId`),
    UNIQUE INDEX `StudentDetails_phone_key`(`phone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Lecturer` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `staffId` VARCHAR(191) NULL,
    `title` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `departmentId` INTEGER NOT NULL,
    `email` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `role` ENUM('LECTURER', 'HOD', 'DEAN', 'EXAMINER') NOT NULL DEFAULT 'LECTURER',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `password` VARCHAR(191) NOT NULL,
    `profileImg` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Lecturer_staffId_key`(`staffId`),
    UNIQUE INDEX `Lecturer_email_key`(`email`),
    UNIQUE INDEX `Lecturer_phone_key`(`phone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ICTStaff` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `staffId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `password` VARCHAR(191) NOT NULL,
    `profileImg` VARCHAR(191) NULL,
    `canManageCourses` BOOLEAN NOT NULL DEFAULT false,
    `canManageCourseRegistration` BOOLEAN NOT NULL DEFAULT false,
    `canManageScores` BOOLEAN NOT NULL DEFAULT false,
    `canManageResults` BOOLEAN NOT NULL DEFAULT false,
    `canViewAnalytics` BOOLEAN NOT NULL DEFAULT false,
    `canManageExams` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ICTStaff_staffId_key`(`staffId`),
    UNIQUE INDEX `ICTStaff_email_key`(`email`),
    UNIQUE INDEX `ICTStaff_phone_key`(`phone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Faculty` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `facultyCode` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Faculty_name_key`(`name`),
    UNIQUE INDEX `Faculty_facultyCode_key`(`facultyCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Department` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `facultyId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Department_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StaffCourse` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `lecturerId` INTEGER NOT NULL,
    `courseId` INTEGER NOT NULL,
    `semesterId` INTEGER NOT NULL,
    `seasonId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `StaffCourse_lecturerId_courseId_semesterId_seasonId_key`(`lecturerId`, `courseId`, `semesterId`, `seasonId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Program` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `programCode` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `degree` VARCHAR(191) NOT NULL,
    `degreeType` ENUM('UNDERGRADUATE', 'POSTGRADUATE_DIPLOMA', 'MASTERS', 'PHD', 'CERTIFICATE', 'DIPLOMA') NOT NULL,
    `duration` INTEGER NOT NULL,
    `modeOfStudy` ENUM('FULL_TIME', 'PART_TIME', 'DISTANCE_LEARNING', 'EVENING') NULL,
    `departmentId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Program_programCode_key`(`programCode`),
    INDEX `Program_name_idx`(`name`),
    UNIQUE INDEX `Program_name_degree_degreeType_departmentId_key`(`name`, `degree`, `degreeType`, `departmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Level` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `value` INTEGER NOT NULL,
    `description` VARCHAR(191) NULL,
    `order` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Level_name_key`(`name`),
    UNIQUE INDEX `Level_value_key`(`value`),
    UNIQUE INDEX `Level_order_key`(`order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProgramCourseUnitRequirement` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `programId` INTEGER NOT NULL,
    `levelId` INTEGER NOT NULL,
    `semesterType` ENUM('FIRST', 'SECOND', 'SUMMER') NOT NULL,
    `minimumCreditUnits` INTEGER NOT NULL,
    `maximumCreditUnits` INTEGER NOT NULL,
    `description` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ProgramCourseUnitRequirement_programId_idx`(`programId`),
    INDEX `ProgramCourseUnitRequirement_levelId_idx`(`levelId`),
    INDEX `ProgramCourseUnitRequirement_semesterType_idx`(`semesterType`),
    UNIQUE INDEX `ProgramCourseUnitRequirement_programId_levelId_semesterType_key`(`programId`, `levelId`, `semesterType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Course` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `creditUnit` INTEGER NOT NULL,
    `preferredSemesterType` ENUM('FIRST', 'SECOND', 'SUMMER') NULL,
    `departmentId` INTEGER NOT NULL,
    `courseType` ENUM('CORE', 'ELECTIVE') NOT NULL DEFAULT 'CORE',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Course_code_key`(`code`),
    INDEX `Course_title_idx`(`title`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CoursePrerequisite` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `courseId` INTEGER NOT NULL,
    `prerequisiteId` INTEGER NOT NULL,

    UNIQUE INDEX `CoursePrerequisite_courseId_prerequisiteId_key`(`courseId`, `prerequisiteId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProgramCourse` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `programId` INTEGER NOT NULL,
    `courseId` INTEGER NOT NULL,
    `levelId` INTEGER NOT NULL,
    `isElective` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ProgramCourse_programId_courseId_levelId_key`(`programId`, `courseId`, `levelId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Season` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT false,
    `isComplete` BOOLEAN NOT NULL DEFAULT false,
    `startDate` DATETIME(3) NULL,
    `endDate` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Season_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Semester` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `seasonId` INTEGER NOT NULL,
    `type` ENUM('FIRST', 'SECOND', 'SUMMER') NOT NULL,
    `semesterNumber` INTEGER NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT false,
    `startDate` DATETIME(3) NULL,
    `endDate` DATETIME(3) NULL,
    `areStudentEditsLocked` BOOLEAN NOT NULL DEFAULT false,
    `areLecturerScoreEditsLocked` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Semester_name_seasonId_key`(`name`, `seasonId`),
    UNIQUE INDEX `Semester_type_seasonId_key`(`type`, `seasonId`),
    UNIQUE INDEX `Semester_semesterNumber_seasonId_key`(`semesterNumber`, `seasonId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StudentCourseRegistration` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `studentId` INTEGER NOT NULL,
    `courseId` INTEGER NOT NULL,
    `semesterId` INTEGER NOT NULL,
    `levelId` INTEGER NOT NULL,
    `seasonId` INTEGER NOT NULL,
    `isScoreRecorded` BOOLEAN NOT NULL DEFAULT false,
    `registeredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `StudentCourseRegistration_studentId_courseId_semesterId_seas_key`(`studentId`, `courseId`, `semesterId`, `seasonId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Score` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `studentCourseRegistrationId` INTEGER NOT NULL,
    `firstCA` DOUBLE NULL,
    `secondCA` DOUBLE NULL,
    `examScore` DOUBLE NULL,
    `totalScore` DOUBLE NULL,
    `grade` ENUM('A', 'B', 'C', 'D', 'E', 'F', 'P', 'I') NULL,
    `point` DOUBLE NULL,
    `resultId` INTEGER NULL,
    `submittedByLecturerId` INTEGER NULL,
    `submittedAt` DATETIME(3) NULL,
    `isApprovedByExaminer` BOOLEAN NOT NULL DEFAULT false,
    `examinerApprovedAt` DATETIME(3) NULL,
    `examinerWhoApprovedId` INTEGER NULL,
    `isAcceptedByHOD` BOOLEAN NOT NULL DEFAULT false,
    `hodAcceptedAt` DATETIME(3) NULL,
    `hodWhoAcceptedId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Score_studentCourseRegistrationId_key`(`studentCourseRegistrationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Result` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `studentId` INTEGER NOT NULL,
    `semesterId` INTEGER NOT NULL,
    `seasonId` INTEGER NOT NULL,
    `departmentId` INTEGER NOT NULL,
    `programId` INTEGER NOT NULL,
    `levelId` INTEGER NOT NULL,
    `gpa` DOUBLE NULL,
    `cgpa` DOUBLE NULL,
    `cuAttempted` INTEGER NULL,
    `cuPassed` INTEGER NULL,
    `cuTotal` INTEGER NULL,
    `remarks` ENUM('PROMOTED', 'PROBATION', 'WITHDRAWN', 'DISTINCTION', 'CREDIT', 'PASS', 'FAIL') NULL,
    `isApprovedForStudentRelease` BOOLEAN NOT NULL DEFAULT false,
    `studentReleaseApprovedAt` DATETIME(3) NULL,
    `studentReleaseApprovedByAdminId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Result_studentId_semesterId_seasonId_key`(`studentId`, `semesterId`, `seasonId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SchoolFeeList` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `levelId` INTEGER NOT NULL,
    `departmentId` INTEGER NULL,
    `programId` INTEGER NULL,
    `facultyId` INTEGER NULL,
    `seasonId` INTEGER NOT NULL,
    `amount` DOUBLE NOT NULL,
    `description` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `nationality` ENUM('Nigerian', 'International') NULL,

    UNIQUE INDEX `SchoolFeeList_levelId_departmentId_seasonId_programId_facult_key`(`levelId`, `departmentId`, `seasonId`, `programId`, `facultyId`, `nationality`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SchoolFee` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `studentId` INTEGER NOT NULL,
    `seasonId` INTEGER NOT NULL,
    `semesterId` INTEGER NULL,
    `amount` DOUBLE NOT NULL,
    `amountPaid` DOUBLE NOT NULL DEFAULT 0,
    `paymentStatus` ENUM('PENDING', 'PAID', 'PARTIAL', 'WAIVED', 'OVERDUE', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `dueDate` DATETIME(3) NULL,
    `description` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `departmentId` INTEGER NULL,
    `programId` INTEGER NULL,

    UNIQUE INDEX `SchoolFee_studentId_seasonId_semesterId_key`(`studentId`, `seasonId`, `semesterId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymentReceipt` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `studentId` INTEGER NOT NULL,
    `schoolFeeId` INTEGER NULL,
    `hostelBookingId` INTEGER NULL,
    `amountExpected` DOUBLE NULL,
    `amountPaid` DOUBLE NOT NULL,
    `paymentDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `paymentStatus` ENUM('PENDING', 'PAID', 'PARTIAL', 'WAIVED', 'OVERDUE', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `reference` VARCHAR(191) NOT NULL,
    `transactionId` VARCHAR(191) NULL,
    `channel` ENUM('FLUTTERWAVE', 'PAYSTACK', 'STRIPE', 'BANK_TRANSFER') NULL,
    `seasonId` INTEGER NOT NULL,
    `description` VARCHAR(191) NULL,
    `paymentGatewayResponse` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PaymentReceipt_reference_key`(`reference`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Hostel` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `capacity` INTEGER NOT NULL,
    `gender` ENUM('MALE', 'FEMALE') NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Hostel_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HostelRoom` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `hostelId` INTEGER NOT NULL,
    `roomNumber` VARCHAR(191) NOT NULL,
    `capacity` INTEGER NOT NULL,
    `isAvailable` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `HostelRoom_hostelId_roomNumber_key`(`hostelId`, `roomNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HostelBooking` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `studentId` INTEGER NOT NULL,
    `hostelId` INTEGER NOT NULL,
    `roomId` INTEGER NOT NULL,
    `seasonId` INTEGER NOT NULL,
    `checkInDate` DATETIME(3) NULL,
    `checkOutDate` DATETIME(3) NULL,
    `amountDue` DOUBLE NULL,
    `amountPaid` DOUBLE NOT NULL DEFAULT 0,
    `paymentStatus` ENUM('PENDING', 'PAID', 'PARTIAL', 'CANCELLED', 'CONFIRMED') NOT NULL DEFAULT 'PENDING',
    `paymentDeadline` DATETIME(3) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `HostelBooking_studentId_seasonId_key`(`studentId`, `seasonId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `recipientType` VARCHAR(191) NOT NULL,
    `recipientId` INTEGER NOT NULL,
    `message` TEXT NOT NULL,
    `isRead` BOOLEAN NOT NULL DEFAULT false,
    `link` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `studentId` INTEGER NULL,
    `lecturerId` INTEGER NULL,

    INDEX `Notification_recipientType_recipientId_isRead_idx`(`recipientType`, `recipientId`, `isRead`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Venue` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `location` VARCHAR(191) NULL,
    `capacity` INTEGER NULL,
    `isCBT` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Venue_name_key`(`name`),
    INDEX `Venue_name_idx`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Exam` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(191) NOT NULL,
    `courseId` INTEGER NOT NULL,
    `semesterId` INTEGER NOT NULL,
    `seasonId` INTEGER NOT NULL,
    `examType` ENUM('MID_SEMESTER', 'FINAL', 'QUIZ', 'ASSIGNMENT', 'MAKEUP', 'CBT', 'PRACTICAL') NOT NULL,
    `instructions` TEXT NULL,
    `durationMinutes` INTEGER NOT NULL,
    `totalMarks` DOUBLE NULL,
    `passMark` DOUBLE NULL,
    `questionsInBank` INTEGER NULL,
    `questionsToAttempt` INTEGER NOT NULL,
    `status` ENUM('PENDING', 'ACTIVE', 'COMPLETED', 'GRADING_IN_PROGRESS', 'GRADED', 'RESULTS_PUBLISHED', 'ARCHIVED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `accessPassword` VARCHAR(255) NULL,
    `createdByLecturerId` INTEGER NULL,
    `createdByICTStaffId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Exam_courseId_semesterId_seasonId_examType_idx`(`courseId`, `semesterId`, `seasonId`, `examType`),
    INDEX `Exam_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExamSession` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `examId` INTEGER NOT NULL,
    `venueId` INTEGER NULL,
    `sessionName` VARCHAR(191) NULL,
    `startTime` DATETIME(3) NOT NULL,
    `endTime` DATETIME(3) NOT NULL,
    `accessPassword` VARCHAR(255) NULL,
    `maxAttendees` INTEGER NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ExamSession_examId_idx`(`examId`),
    INDEX `ExamSession_venueId_idx`(`venueId`),
    INDEX `ExamSession_startTime_idx`(`startTime`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StudentExamSessionAssignment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `studentId` INTEGER NOT NULL,
    `examSessionId` INTEGER NOT NULL,
    `seatNumber` VARCHAR(191) NULL,
    `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `StudentExamSessionAssignment_examSessionId_idx`(`examSessionId`),
    INDEX `StudentExamSessionAssignment_studentId_idx`(`studentId`),
    UNIQUE INDEX `StudentExamSessionAssignment_studentId_examSessionId_key`(`studentId`, `examSessionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Question` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `examId` INTEGER NOT NULL,
    `questionText` TEXT NOT NULL,
    `questionType` ENUM('MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER', 'ESSAY') NOT NULL,
    `marks` DOUBLE NOT NULL,
    `correctOptionKey` VARCHAR(191) NULL,
    `explanation` TEXT NULL,
    `difficulty` VARCHAR(191) NULL,
    `topic` VARCHAR(191) NULL,
    `isBankQuestion` BOOLEAN NOT NULL DEFAULT true,
    `displayOrder` INTEGER NULL,
    `addedByLecturerId` INTEGER NULL,
    `addedByICTStaffId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Question_examId_questionType_idx`(`examId`, `questionType`),
    INDEX `Question_topic_idx`(`topic`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `QuestionOption` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `questionId` INTEGER NOT NULL,
    `optionKey` VARCHAR(191) NOT NULL,
    `optionText` TEXT NOT NULL,
    `isCorrect` BOOLEAN NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `QuestionOption_questionId_optionKey_key`(`questionId`, `optionKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExamAttempt` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `studentId` INTEGER NOT NULL,
    `examId` INTEGER NOT NULL,
    `examSessionId` INTEGER NOT NULL,
    `startTime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `endTime` DATETIME(3) NULL,
    `timeUsedSeconds` INTEGER NULL,
    `scoreAchieved` DOUBLE NULL,
    `isSubmitted` BOOLEAN NOT NULL DEFAULT false,
    `isGraded` BOOLEAN NOT NULL DEFAULT false,
    `ipAddress` VARCHAR(191) NULL,
    `userAgent` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ExamAttempt_examId_studentId_idx`(`examId`, `studentId`),
    UNIQUE INDEX `ExamAttempt_studentId_examSessionId_key`(`studentId`, `examSessionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StudentAnswer` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `examAttemptId` INTEGER NOT NULL,
    `questionId` INTEGER NOT NULL,
    `selectedOptionKey` VARCHAR(191) NULL,
    `answerText` TEXT NULL,
    `isCorrect` BOOLEAN NULL,
    `marksAwarded` DOUBLE NULL,
    `reviewComment` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `StudentAnswer_examAttemptId_questionId_key`(`examAttemptId`, `questionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ScreeningFeeList` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `seasonId` INTEGER NOT NULL,
    `entryMode` ENUM('UTME', 'DIRECT_ENTRY', 'TRANSFER') NOT NULL,
    `amount` DOUBLE NOT NULL,
    `description` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ScreeningFeeList_seasonId_entryMode_key`(`seasonId`, `entryMode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AcceptanceFeeList` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `seasonId` INTEGER NOT NULL,
    `programId` INTEGER NULL,
    `facultyId` INTEGER NULL,
    `entryMode` ENUM('UTME', 'DIRECT_ENTRY', 'TRANSFER') NULL,
    `amount` DOUBLE NOT NULL,
    `description` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `unique_acceptance_fee_item`(`seasonId`, `programId`, `facultyId`, `entryMode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ApplicantPayment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `applicationProfileId` INTEGER NOT NULL,
    `purpose` ENUM('SCREENING_APPLICATION_FEE', 'ADMISSION_ACCEPTANCE_FEE') NOT NULL,
    `amountExpected` DOUBLE NOT NULL,
    `amountPaid` DOUBLE NOT NULL,
    `paymentStatus` ENUM('PENDING', 'PAID', 'PARTIAL', 'WAIVED', 'OVERDUE', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `paymentDate` DATETIME(3) NULL,
    `paymentReference` VARCHAR(191) NOT NULL,
    `paymentChannel` ENUM('FLUTTERWAVE', 'PAYSTACK', 'STRIPE', 'BANK_TRANSFER') NULL,
    `transactionId` VARCHAR(191) NULL,
    `paymentGatewayResponse` JSON NULL,
    `screeningFeeListId` INTEGER NULL,
    `acceptanceFeeListId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ApplicantPayment_paymentReference_key`(`paymentReference`),
    UNIQUE INDEX `ApplicantPayment_transactionId_key`(`transactionId`),
    INDEX `ApplicantPayment_applicationProfileId_purpose_idx`(`applicationProfileId`, `purpose`),
    INDEX `ApplicantPayment_paymentStatus_idx`(`paymentStatus`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `JambApplicant` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `jambRegNo` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `programName` VARCHAR(191) NOT NULL,
    `entryMode` ENUM('UTME', 'DIRECT_ENTRY', 'TRANSFER') NOT NULL,
    `gender` ENUM('MALE', 'FEMALE') NULL,
    `phoneNumber` VARCHAR(191) NULL,
    `jambScore` INTEGER NULL,
    `deGrade` VARCHAR(191) NULL,
    `dateOfBirth` DATETIME(3) NULL,
    `jambYear` VARCHAR(191) NULL,
    `jambSeasonId` INTEGER NULL,
    `uploadedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `uploadedBy` VARCHAR(191) NULL,

    UNIQUE INDEX `JambApplicant_jambRegNo_key`(`jambRegNo`),
    UNIQUE INDEX `JambApplicant_email_key`(`email`),
    INDEX `JambApplicant_name_idx`(`name`),
    INDEX `JambApplicant_programName_idx`(`programName`),
    INDEX `JambApplicant_jambSeasonId_idx`(`jambSeasonId`),
    UNIQUE INDEX `JambApplicant_jambRegNo_email_key`(`jambRegNo`, `email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OnlineScreeningList` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `jambRegNo` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `password` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `lastLogin` DATETIME(3) NULL,
    `scheduleDate` DATETIME(3) NULL,
    `startDate` DATETIME(3) NULL,
    `endDate` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `OnlineScreeningList_jambRegNo_key`(`jambRegNo`),
    UNIQUE INDEX `OnlineScreeningList_email_key`(`email`),
    INDEX `OnlineScreeningList_email_idx`(`email`),
    INDEX `OnlineScreeningList_scheduleDate_idx`(`scheduleDate`),
    INDEX `OnlineScreeningList_startDate_idx`(`startDate`),
    UNIQUE INDEX `OnlineScreeningList_jambRegNo_email_key`(`jambRegNo`, `email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ApplicationProfile` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `jambRegNo` VARCHAR(191) NOT NULL,
    `onlineScreeningListId` INTEGER NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `applicationStatus` ENUM('PENDING_SUBMISSION', 'SUBMITTED', 'UNDER_REVIEW', 'SCREENING_PASSED', 'SCREENING_FAILED', 'ADMITTED', 'ADMISSION_ACCEPTED', 'ADMISSION_REJECTED', 'PENDING_PAYMENT', 'ENROLLED', 'CLOSED') NOT NULL DEFAULT 'PENDING_SUBMISSION',
    `remarks` TEXT NULL,
    `targetProgramId` INTEGER NULL,
    `hasPaidScreeningFee` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ApplicationProfile_jambRegNo_key`(`jambRegNo`),
    UNIQUE INDEX `ApplicationProfile_onlineScreeningListId_key`(`onlineScreeningListId`),
    UNIQUE INDEX `ApplicationProfile_email_key`(`email`),
    UNIQUE INDEX `ApplicationProfile_phone_key`(`phone`),
    INDEX `ApplicationProfile_applicationStatus_idx`(`applicationStatus`),
    INDEX `ApplicationProfile_hasPaidScreeningFee_idx`(`hasPaidScreeningFee`),
    INDEX `ApplicationProfile_email_idx`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ApplicantBioData` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `applicationProfileId` INTEGER NOT NULL,
    `firstName` VARCHAR(191) NOT NULL,
    `middleName` VARCHAR(191) NULL,
    `lastName` VARCHAR(191) NOT NULL,
    `dateOfBirth` DATETIME(3) NOT NULL,
    `gender` ENUM('MALE', 'FEMALE') NOT NULL,
    `nationality` VARCHAR(191) NOT NULL DEFAULT 'Nigerian',
    `placeOfBirth` VARCHAR(191) NULL,
    `maritalStatus` VARCHAR(191) NULL,
    `religion` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ApplicantBioData_applicationProfileId_key`(`applicationProfileId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ApplicantContactInfo` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `applicationProfileId` INTEGER NOT NULL,
    `countryOfResidence` VARCHAR(191) NOT NULL DEFAULT 'Nigeria',
    `stateOfResidence` VARCHAR(191) NOT NULL,
    `lgaOfResidence` VARCHAR(191) NOT NULL,
    `residentialAddress` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ApplicantContactInfo_applicationProfileId_key`(`applicationProfileId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ApplicantNextOfKin` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `applicationProfileId` INTEGER NOT NULL,
    `fullName` VARCHAR(191) NOT NULL,
    `relationship` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `address` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ApplicantNextOfKin_applicationProfileId_key`(`applicationProfileId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ApplicantGuardianInfo` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `applicationProfileId` INTEGER NOT NULL,
    `fullName` VARCHAR(191) NOT NULL,
    `relationship` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `address` TEXT NULL,
    `occupation` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ApplicantGuardianInfo_applicationProfileId_key`(`applicationProfileId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ApplicantOLevelResult` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `applicationProfileId` INTEGER NOT NULL,
    `examType` ENUM('WAEC', 'NECO', 'NABTEB', 'GCE_WAEC', 'GCE_NECO') NOT NULL,
    `examYear` INTEGER NOT NULL,
    `examNumber` VARCHAR(191) NOT NULL,
    `cardPin` VARCHAR(191) NULL,
    `cardSerialNumber` VARCHAR(191) NULL,
    `candidateIdNumber` VARCHAR(191) NULL,
    `sittingNumber` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ApplicantOLevelResult_applicationProfileId_idx`(`applicationProfileId`),
    UNIQUE INDEX `ApplicantOLevelResult_applicationProfileId_examType_examNumb_key`(`applicationProfileId`, `examType`, `examNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ApplicantOLevelSubjectGrade` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `oLevelResultId` INTEGER NOT NULL,
    `subjectName` VARCHAR(191) NOT NULL,
    `grade` ENUM('A1', 'B2', 'B3', 'C4', 'C5', 'C6', 'D7', 'E8', 'F9', 'AR', 'AB') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ApplicantOLevelSubjectGrade_oLevelResultId_subjectName_key`(`oLevelResultId`, `subjectName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ApplicantTertiaryQualification` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `applicationProfileId` INTEGER NOT NULL,
    `institutionName` VARCHAR(191) NOT NULL,
    `qualificationObtained` ENUM('ND', 'HND', 'NCE', 'BSC', 'MSC', 'PGD') NOT NULL,
    `courseOfStudy` VARCHAR(191) NOT NULL,
    `graduationYear` INTEGER NULL,
    `gradeOrClass` VARCHAR(191) NULL,
    `cgpa` DOUBLE NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ApplicantTertiaryQualification_applicationProfileId_idx`(`applicationProfileId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ApplicantDocument` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `applicationProfileId` INTEGER NOT NULL,
    `documentType` ENUM('PROFILE_PHOTO', 'BIRTH_CERTIFICATE', 'OLEVEL_CERTIFICATE_FIRST_SITTING', 'OLEVEL_CERTIFICATE_SECOND_SITTING', 'CERTIFICATE_OF_ORIGIN', 'JAMB_RESULT_SLIP', 'TERTIARY_TRANSCRIPT', 'TERTIARY_CERTIFICATE') NOT NULL,
    `fileUrl` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NULL,
    `fileType` VARCHAR(191) NULL,
    `fileSize` INTEGER NULL,
    `status` ENUM('NOT_UPLOADED', 'UPLOADED', 'VERIFIED', 'REJECTED') NOT NULL DEFAULT 'UPLOADED',
    `rejectionReason` VARCHAR(191) NULL,
    `verifiedBy` VARCHAR(191) NULL,
    `verifiedAt` DATETIME(3) NULL,
    `uploadedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ApplicantDocument_applicationProfileId_documentType_key`(`applicationProfileId`, `documentType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PhysicalScreeningList` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `applicationProfileId` INTEGER NOT NULL,
    `jambRegNo` VARCHAR(191) NOT NULL,
    `screeningDate` DATETIME(3) NULL,
    `screeningStartDate` DATETIME(3) NULL,
    `screeningEndDate` DATETIME(3) NULL,
    `screenedBy` VARCHAR(191) NULL,
    `status` ENUM('PENDING_SUBMISSION', 'SUBMITTED', 'UNDER_REVIEW', 'SCREENING_PASSED', 'SCREENING_FAILED', 'ADMITTED', 'ADMISSION_ACCEPTED', 'ADMISSION_REJECTED', 'PENDING_PAYMENT', 'ENROLLED', 'CLOSED') NOT NULL DEFAULT 'UNDER_REVIEW',
    `remarks` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PhysicalScreeningList_applicationProfileId_key`(`applicationProfileId`),
    INDEX `PhysicalScreeningList_jambRegNo_idx`(`jambRegNo`),
    INDEX `PhysicalScreeningList_status_idx`(`status`),
    INDEX `PhysicalScreeningList_screeningDate_idx`(`screeningDate`),
    INDEX `PhysicalScreeningList_screeningStartDate_idx`(`screeningStartDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AdmissionOffer` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `applicationProfileId` INTEGER NOT NULL,
    `physicalScreeningId` INTEGER NULL,
    `offeredProgramId` INTEGER NOT NULL,
    `offeredLevelId` INTEGER NOT NULL,
    `admissionSeasonId` INTEGER NOT NULL,
    `admissionSemesterId` INTEGER NOT NULL,
    `offerDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `acceptanceDeadline` DATETIME(3) NULL,
    `isAccepted` BOOLEAN NULL,
    `acceptanceDate` DATETIME(3) NULL,
    `rejectionReason` TEXT NULL,
    `generatedStudentRegNo` VARCHAR(191) NULL,
    `createdStudentId` INTEGER NULL,
    `admissionLetterUrl` VARCHAR(191) NULL,
    `acceptanceFeeListId` INTEGER NULL,
    `hasPaidAcceptanceFee` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AdmissionOffer_applicationProfileId_key`(`applicationProfileId`),
    UNIQUE INDEX `AdmissionOffer_physicalScreeningId_key`(`physicalScreeningId`),
    UNIQUE INDEX `AdmissionOffer_generatedStudentRegNo_key`(`generatedStudentRegNo`),
    UNIQUE INDEX `AdmissionOffer_createdStudentId_key`(`createdStudentId`),
    INDEX `AdmissionOffer_offeredProgramId_idx`(`offeredProgramId`),
    INDEX `AdmissionOffer_isAccepted_idx`(`isAccepted`),
    INDEX `AdmissionOffer_hasPaidAcceptanceFee_idx`(`hasPaidAcceptanceFee`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AdmissionLetterTemplate` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `templateName` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `templateType` ENUM('ADMISSION_LETTER', 'PROVISIONAL_ADMISSION', 'DEFERRED_ADMISSION', 'SCHOLARSHIP_OFFER', 'GENERAL_ANNOUNCEMENT', 'STUDENT_ID_PICKUP', 'ACADEMIC_WARNING', 'ACADEMIC_PROBATION', 'GRADUATION_CLEARANCE_NOTICE', 'ALUMNI_WELCOME', 'COURSE_REGISTRATION_GUIDE', 'HOSTEL_ALLOCATION', 'HOSTEL_REGISTRATION_GUIDE', 'EXAMINATION_GUIDE', 'EXAMINATION_RESULTS_NOTICE', 'TRANSCRIPT_REQUEST_GUIDE', 'TRANSCRIPT_ISSUANCE_NOTICE', 'TRANSFER_ADMISSION_NOTICE', 'TRANSFER_ADMISSION_GUIDE', 'TRANSFER_ADMISSION_APPROVAL', 'TRANSFER_ADMISSION_REJECTION') NOT NULL DEFAULT 'ADMISSION_LETTER',
    `schoolLogoUrl` VARCHAR(191) NULL,
    `letterheadAddress` TEXT NULL,
    `letterheadContacts` VARCHAR(191) NULL,
    `registrarName` VARCHAR(191) NOT NULL,
    `registrarTitle` VARCHAR(191) NOT NULL DEFAULT 'Registrar',
    `registrarSignatureUrl` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AdmissionLetterTemplate_templateName_key`(`templateName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AdmissionLetterSection` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `templateId` INTEGER NOT NULL,
    `sectionType` ENUM('HEADER', 'SALUTATION', 'BODY_PARAGRAPH', 'TERMS_CONDITIONS_INTRO', 'TERMS_CONDITIONS_ITEM', 'CONCLUDING_PARAGRAPH', 'CLOSING', 'SIGNATURE_BLOCK', 'FOOTER', 'WATERMARK_TEXT') NOT NULL,
    `title` VARCHAR(191) NULL,
    `content` TEXT NOT NULL,
    `order` INTEGER NOT NULL,
    `isConditional` BOOLEAN NOT NULL DEFAULT false,
    `conditionField` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AdmissionLetterSection_templateId_sectionType_idx`(`templateId`, `sectionType`),
    UNIQUE INDEX `AdmissionLetterSection_templateId_order_key`(`templateId`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Student` ADD CONSTRAINT `Student_entryLevelId_fkey` FOREIGN KEY (`entryLevelId`) REFERENCES `Level`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Student` ADD CONSTRAINT `Student_currentLevelId_fkey` FOREIGN KEY (`currentLevelId`) REFERENCES `Level`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Student` ADD CONSTRAINT `Student_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Student` ADD CONSTRAINT `Student_programId_fkey` FOREIGN KEY (`programId`) REFERENCES `Program`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Student` ADD CONSTRAINT `Student_admissionSeasonId_fkey` FOREIGN KEY (`admissionSeasonId`) REFERENCES `Season`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Student` ADD CONSTRAINT `Student_admissionSemesterId_fkey` FOREIGN KEY (`admissionSemesterId`) REFERENCES `Semester`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Student` ADD CONSTRAINT `Student_graduationSeasonId_fkey` FOREIGN KEY (`graduationSeasonId`) REFERENCES `Season`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Student` ADD CONSTRAINT `Student_graduationSemesterId_fkey` FOREIGN KEY (`graduationSemesterId`) REFERENCES `Semester`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Student` ADD CONSTRAINT `Student_currentSeasonId_fkey` FOREIGN KEY (`currentSeasonId`) REFERENCES `Season`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Student` ADD CONSTRAINT `Student_currentSemesterId_fkey` FOREIGN KEY (`currentSemesterId`) REFERENCES `Semester`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StudentDetails` ADD CONSTRAINT `StudentDetails_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Lecturer` ADD CONSTRAINT `Lecturer_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Department` ADD CONSTRAINT `Department_facultyId_fkey` FOREIGN KEY (`facultyId`) REFERENCES `Faculty`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StaffCourse` ADD CONSTRAINT `StaffCourse_lecturerId_fkey` FOREIGN KEY (`lecturerId`) REFERENCES `Lecturer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StaffCourse` ADD CONSTRAINT `StaffCourse_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `Course`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StaffCourse` ADD CONSTRAINT `StaffCourse_semesterId_fkey` FOREIGN KEY (`semesterId`) REFERENCES `Semester`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StaffCourse` ADD CONSTRAINT `StaffCourse_seasonId_fkey` FOREIGN KEY (`seasonId`) REFERENCES `Season`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Program` ADD CONSTRAINT `Program_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProgramCourseUnitRequirement` ADD CONSTRAINT `ProgramCourseUnitRequirement_programId_fkey` FOREIGN KEY (`programId`) REFERENCES `Program`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProgramCourseUnitRequirement` ADD CONSTRAINT `ProgramCourseUnitRequirement_levelId_fkey` FOREIGN KEY (`levelId`) REFERENCES `Level`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Course` ADD CONSTRAINT `Course_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CoursePrerequisite` ADD CONSTRAINT `CoursePrerequisite_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `Course`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CoursePrerequisite` ADD CONSTRAINT `CoursePrerequisite_prerequisiteId_fkey` FOREIGN KEY (`prerequisiteId`) REFERENCES `Course`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProgramCourse` ADD CONSTRAINT `ProgramCourse_programId_fkey` FOREIGN KEY (`programId`) REFERENCES `Program`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProgramCourse` ADD CONSTRAINT `ProgramCourse_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `Course`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProgramCourse` ADD CONSTRAINT `ProgramCourse_levelId_fkey` FOREIGN KEY (`levelId`) REFERENCES `Level`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Semester` ADD CONSTRAINT `Semester_seasonId_fkey` FOREIGN KEY (`seasonId`) REFERENCES `Season`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StudentCourseRegistration` ADD CONSTRAINT `StudentCourseRegistration_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StudentCourseRegistration` ADD CONSTRAINT `StudentCourseRegistration_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `Course`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StudentCourseRegistration` ADD CONSTRAINT `StudentCourseRegistration_semesterId_fkey` FOREIGN KEY (`semesterId`) REFERENCES `Semester`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StudentCourseRegistration` ADD CONSTRAINT `StudentCourseRegistration_levelId_fkey` FOREIGN KEY (`levelId`) REFERENCES `Level`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StudentCourseRegistration` ADD CONSTRAINT `StudentCourseRegistration_seasonId_fkey` FOREIGN KEY (`seasonId`) REFERENCES `Season`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Score` ADD CONSTRAINT `Score_studentCourseRegistrationId_fkey` FOREIGN KEY (`studentCourseRegistrationId`) REFERENCES `StudentCourseRegistration`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Score` ADD CONSTRAINT `Score_resultId_fkey` FOREIGN KEY (`resultId`) REFERENCES `Result`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Score` ADD CONSTRAINT `Score_submittedByLecturerId_fkey` FOREIGN KEY (`submittedByLecturerId`) REFERENCES `Lecturer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Score` ADD CONSTRAINT `Score_examinerWhoApprovedId_fkey` FOREIGN KEY (`examinerWhoApprovedId`) REFERENCES `Lecturer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Score` ADD CONSTRAINT `Score_hodWhoAcceptedId_fkey` FOREIGN KEY (`hodWhoAcceptedId`) REFERENCES `Lecturer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Result` ADD CONSTRAINT `Result_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Result` ADD CONSTRAINT `Result_semesterId_fkey` FOREIGN KEY (`semesterId`) REFERENCES `Semester`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Result` ADD CONSTRAINT `Result_seasonId_fkey` FOREIGN KEY (`seasonId`) REFERENCES `Season`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Result` ADD CONSTRAINT `Result_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Result` ADD CONSTRAINT `Result_programId_fkey` FOREIGN KEY (`programId`) REFERENCES `Program`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Result` ADD CONSTRAINT `Result_levelId_fkey` FOREIGN KEY (`levelId`) REFERENCES `Level`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Result` ADD CONSTRAINT `Result_studentReleaseApprovedByAdminId_fkey` FOREIGN KEY (`studentReleaseApprovedByAdminId`) REFERENCES `Admin`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SchoolFeeList` ADD CONSTRAINT `SchoolFeeList_levelId_fkey` FOREIGN KEY (`levelId`) REFERENCES `Level`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SchoolFeeList` ADD CONSTRAINT `SchoolFeeList_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SchoolFeeList` ADD CONSTRAINT `SchoolFeeList_programId_fkey` FOREIGN KEY (`programId`) REFERENCES `Program`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SchoolFeeList` ADD CONSTRAINT `SchoolFeeList_facultyId_fkey` FOREIGN KEY (`facultyId`) REFERENCES `Faculty`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SchoolFeeList` ADD CONSTRAINT `SchoolFeeList_seasonId_fkey` FOREIGN KEY (`seasonId`) REFERENCES `Season`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SchoolFee` ADD CONSTRAINT `SchoolFee_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SchoolFee` ADD CONSTRAINT `SchoolFee_seasonId_fkey` FOREIGN KEY (`seasonId`) REFERENCES `Season`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SchoolFee` ADD CONSTRAINT `SchoolFee_semesterId_fkey` FOREIGN KEY (`semesterId`) REFERENCES `Semester`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SchoolFee` ADD CONSTRAINT `SchoolFee_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SchoolFee` ADD CONSTRAINT `SchoolFee_programId_fkey` FOREIGN KEY (`programId`) REFERENCES `Program`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentReceipt` ADD CONSTRAINT `PaymentReceipt_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentReceipt` ADD CONSTRAINT `PaymentReceipt_schoolFeeId_fkey` FOREIGN KEY (`schoolFeeId`) REFERENCES `SchoolFee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentReceipt` ADD CONSTRAINT `PaymentReceipt_hostelBookingId_fkey` FOREIGN KEY (`hostelBookingId`) REFERENCES `HostelBooking`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentReceipt` ADD CONSTRAINT `PaymentReceipt_seasonId_fkey` FOREIGN KEY (`seasonId`) REFERENCES `Season`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HostelRoom` ADD CONSTRAINT `HostelRoom_hostelId_fkey` FOREIGN KEY (`hostelId`) REFERENCES `Hostel`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HostelBooking` ADD CONSTRAINT `HostelBooking_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HostelBooking` ADD CONSTRAINT `HostelBooking_hostelId_fkey` FOREIGN KEY (`hostelId`) REFERENCES `Hostel`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HostelBooking` ADD CONSTRAINT `HostelBooking_roomId_fkey` FOREIGN KEY (`roomId`) REFERENCES `HostelRoom`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HostelBooking` ADD CONSTRAINT `HostelBooking_seasonId_fkey` FOREIGN KEY (`seasonId`) REFERENCES `Season`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_lecturerId_fkey` FOREIGN KEY (`lecturerId`) REFERENCES `Lecturer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Exam` ADD CONSTRAINT `Exam_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `Course`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Exam` ADD CONSTRAINT `Exam_semesterId_fkey` FOREIGN KEY (`semesterId`) REFERENCES `Semester`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Exam` ADD CONSTRAINT `Exam_seasonId_fkey` FOREIGN KEY (`seasonId`) REFERENCES `Season`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Exam` ADD CONSTRAINT `Exam_createdByLecturerId_fkey` FOREIGN KEY (`createdByLecturerId`) REFERENCES `Lecturer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Exam` ADD CONSTRAINT `Exam_createdByICTStaffId_fkey` FOREIGN KEY (`createdByICTStaffId`) REFERENCES `ICTStaff`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExamSession` ADD CONSTRAINT `ExamSession_examId_fkey` FOREIGN KEY (`examId`) REFERENCES `Exam`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExamSession` ADD CONSTRAINT `ExamSession_venueId_fkey` FOREIGN KEY (`venueId`) REFERENCES `Venue`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StudentExamSessionAssignment` ADD CONSTRAINT `StudentExamSessionAssignment_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StudentExamSessionAssignment` ADD CONSTRAINT `StudentExamSessionAssignment_examSessionId_fkey` FOREIGN KEY (`examSessionId`) REFERENCES `ExamSession`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Question` ADD CONSTRAINT `Question_examId_fkey` FOREIGN KEY (`examId`) REFERENCES `Exam`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Question` ADD CONSTRAINT `Question_addedByLecturerId_fkey` FOREIGN KEY (`addedByLecturerId`) REFERENCES `Lecturer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Question` ADD CONSTRAINT `Question_addedByICTStaffId_fkey` FOREIGN KEY (`addedByICTStaffId`) REFERENCES `ICTStaff`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuestionOption` ADD CONSTRAINT `QuestionOption_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `Question`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExamAttempt` ADD CONSTRAINT `ExamAttempt_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExamAttempt` ADD CONSTRAINT `ExamAttempt_examId_fkey` FOREIGN KEY (`examId`) REFERENCES `Exam`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExamAttempt` ADD CONSTRAINT `ExamAttempt_examSessionId_fkey` FOREIGN KEY (`examSessionId`) REFERENCES `ExamSession`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StudentAnswer` ADD CONSTRAINT `StudentAnswer_examAttemptId_fkey` FOREIGN KEY (`examAttemptId`) REFERENCES `ExamAttempt`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StudentAnswer` ADD CONSTRAINT `StudentAnswer_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `Question`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScreeningFeeList` ADD CONSTRAINT `ScreeningFeeList_seasonId_fkey` FOREIGN KEY (`seasonId`) REFERENCES `Season`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AcceptanceFeeList` ADD CONSTRAINT `AcceptanceFeeList_seasonId_fkey` FOREIGN KEY (`seasonId`) REFERENCES `Season`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AcceptanceFeeList` ADD CONSTRAINT `AcceptanceFeeList_programId_fkey` FOREIGN KEY (`programId`) REFERENCES `Program`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AcceptanceFeeList` ADD CONSTRAINT `AcceptanceFeeList_facultyId_fkey` FOREIGN KEY (`facultyId`) REFERENCES `Faculty`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApplicantPayment` ADD CONSTRAINT `ApplicantPayment_acceptanceFeeListId_fkey` FOREIGN KEY (`acceptanceFeeListId`) REFERENCES `AcceptanceFeeList`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApplicantPayment` ADD CONSTRAINT `ApplicantPayment_applicationProfileId_fkey` FOREIGN KEY (`applicationProfileId`) REFERENCES `ApplicationProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApplicantPayment` ADD CONSTRAINT `ApplicantPayment_screeningFeeListId_fkey` FOREIGN KEY (`screeningFeeListId`) REFERENCES `ScreeningFeeList`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `JambApplicant` ADD CONSTRAINT `JambApplicant_jambSeasonId_fkey` FOREIGN KEY (`jambSeasonId`) REFERENCES `Season`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OnlineScreeningList` ADD CONSTRAINT `OnlineScreeningList_jambRegNo_fkey` FOREIGN KEY (`jambRegNo`) REFERENCES `JambApplicant`(`jambRegNo`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApplicationProfile` ADD CONSTRAINT `ApplicationProfile_onlineScreeningListId_fkey` FOREIGN KEY (`onlineScreeningListId`) REFERENCES `OnlineScreeningList`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApplicationProfile` ADD CONSTRAINT `ApplicationProfile_targetProgramId_fkey` FOREIGN KEY (`targetProgramId`) REFERENCES `Program`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApplicantBioData` ADD CONSTRAINT `ApplicantBioData_applicationProfileId_fkey` FOREIGN KEY (`applicationProfileId`) REFERENCES `ApplicationProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApplicantContactInfo` ADD CONSTRAINT `ApplicantContactInfo_applicationProfileId_fkey` FOREIGN KEY (`applicationProfileId`) REFERENCES `ApplicationProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApplicantNextOfKin` ADD CONSTRAINT `ApplicantNextOfKin_applicationProfileId_fkey` FOREIGN KEY (`applicationProfileId`) REFERENCES `ApplicationProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApplicantGuardianInfo` ADD CONSTRAINT `ApplicantGuardianInfo_applicationProfileId_fkey` FOREIGN KEY (`applicationProfileId`) REFERENCES `ApplicationProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApplicantOLevelResult` ADD CONSTRAINT `ApplicantOLevelResult_applicationProfileId_fkey` FOREIGN KEY (`applicationProfileId`) REFERENCES `ApplicationProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApplicantOLevelSubjectGrade` ADD CONSTRAINT `ApplicantOLevelSubjectGrade_oLevelResultId_fkey` FOREIGN KEY (`oLevelResultId`) REFERENCES `ApplicantOLevelResult`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApplicantTertiaryQualification` ADD CONSTRAINT `ApplicantTertiaryQualification_applicationProfileId_fkey` FOREIGN KEY (`applicationProfileId`) REFERENCES `ApplicationProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApplicantDocument` ADD CONSTRAINT `ApplicantDocument_applicationProfileId_fkey` FOREIGN KEY (`applicationProfileId`) REFERENCES `ApplicationProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PhysicalScreeningList` ADD CONSTRAINT `PhysicalScreeningList_applicationProfileId_fkey` FOREIGN KEY (`applicationProfileId`) REFERENCES `ApplicationProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AdmissionOffer` ADD CONSTRAINT `AdmissionOffer_physicalScreeningId_fkey` FOREIGN KEY (`physicalScreeningId`) REFERENCES `PhysicalScreeningList`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AdmissionOffer` ADD CONSTRAINT `AdmissionOffer_applicationProfileId_fkey` FOREIGN KEY (`applicationProfileId`) REFERENCES `ApplicationProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AdmissionOffer` ADD CONSTRAINT `AdmissionOffer_acceptanceFeeListId_fkey` FOREIGN KEY (`acceptanceFeeListId`) REFERENCES `AcceptanceFeeList`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AdmissionOffer` ADD CONSTRAINT `AdmissionOffer_createdStudentId_fkey` FOREIGN KEY (`createdStudentId`) REFERENCES `Student`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AdmissionOffer` ADD CONSTRAINT `AdmissionOffer_offeredProgramId_fkey` FOREIGN KEY (`offeredProgramId`) REFERENCES `Program`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AdmissionOffer` ADD CONSTRAINT `AdmissionOffer_offeredLevelId_fkey` FOREIGN KEY (`offeredLevelId`) REFERENCES `Level`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AdmissionOffer` ADD CONSTRAINT `AdmissionOffer_admissionSeasonId_fkey` FOREIGN KEY (`admissionSeasonId`) REFERENCES `Season`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AdmissionOffer` ADD CONSTRAINT `AdmissionOffer_admissionSemesterId_fkey` FOREIGN KEY (`admissionSemesterId`) REFERENCES `Semester`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AdmissionLetterSection` ADD CONSTRAINT `AdmissionLetterSection_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `AdmissionLetterTemplate`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

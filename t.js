generator client {
  provider = "prisma-client-js"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

// --- Enums ---
enum LecturerRole {
  LECTURER
  HOD
  DEAN
  EXAMINER
}

enum Gender {
  MALE
  FEMALE
}

enum SemesterType {
  FIRST
  SECOND
  SUMMER
}

enum EntryMode {
  UTME
  DIRECT_ENTRY
  TRANSFER
}

enum CourseType {
  CORE
  ELECTIVE
}

enum GradeLetter {
  A
  B
  C
  D
  E
  F
  P // Pass (if applicable for non-graded courses)
  I // Incomplete (if applicable)
}

enum BookingPaymentStatus {
  PENDING // Booking made, payment awaited
  PAID // Booking fully paid
  PARTIAL // Partially paid (if allowed)
  CANCELLED // Booking cancelled (e.g., due to non-payment)
  CONFIRMED // Payment confirmed, booking is solid (could be same as PAID or a step after)
}

enum ResultRemark {
  PROMOTED
  PROBATION
  WITHDRAWN
  DISTINCTION
  CREDIT
  PASS
  FAIL
}

enum PaymentStatus {
  PENDING
  PAID
  PARTIAL
  WAIVED
  OVERDUE
  CANCELLED
}

enum DegreeType {
  UNDERGRADUATE
  POSTGRADUATE_DIPLOMA
  MASTERS
  PHD
  CERTIFICATE
  DIPLOMA
}

enum PaymentChannel {
  BANK_TRANSFER
  ONLINE_GATEWAY
  POS
  CASH
  CHEQUE
}

// --- Models ---
model Admin {
  id                        Int      @id @default(autoincrement())
  email                     String   @unique
  password                  String
  name                      String?
  profileImg                String?
  createdAt                 DateTime @default(now())
  updatedAt                 DateTime @updatedAt
  resultsApprovedForRelease Result[] @relation("ResultsApprovedForReleaseByAdmin")
}

model Student {
  id                   Int                         @id @default(autoincrement())
  regNo                String                      @unique
  jambRegNo            String?                     @unique
  name                 String
  email                String                      @unique
  entryMode            EntryMode
  yearOfAdmission      Int
  admissionSeasonId    Int
  admissionSemesterId  Int
  departmentId         Int
  programId            Int
  entryLevelId         Int // <<<< NEW FIELD: The ID of the level at which student was admitted
  currentLevelId       Int // <<<< RENAMED/CLARIFIED: The ID of the student's current level
  currentSeasonId      Int?
  currentSemesterId    Int?
  isActive             Boolean                     @default(true)
  isGraduated          Boolean                     @default(false)
  graduationSeasonId   Int?
  graduationSemesterId Int?
  password             String
  profileImg           String?
  createdAt            DateTime                    @default(now())
  updatedAt            DateTime                    @updatedAt
  entryLevel           Level                       @relation("EntryLevel", fields: [entryLevelId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  currentLevel         Level                       @relation("CurrentLevel", fields: [currentLevelId], references: [id], onDelete: Restrict, onUpdate: Cascade) // Renamed relation
  department           Department                  @relation(fields: [departmentId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  program              Program                     @relation(fields: [programId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  admissionSeason      Season                      @relation("AdmissionSeason", fields: [admissionSeasonId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  admissionSemester    Semester                    @relation("AdmissionSemester", fields: [admissionSemesterId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  currentSeason        Season?                     @relation("CurrentSeason", fields: [currentSeasonId], references: [id], onDelete: SetNull, onUpdate: Cascade)
  currentSemester      Semester?                   @relation("CurrentSemester", fields: [currentSemesterId], references: [id], onDelete: SetNull, onUpdate: Cascade)
  graduationSeason     Season?                     @relation("GraduationSeason", fields: [graduationSeasonId], references: [id], onDelete: SetNull, onUpdate: Cascade)
  graduationSemester   Semester?                   @relation("GraduationSemester", fields: [graduationSemesterId], references: [id], onDelete: SetNull, onUpdate: Cascade)
  studentDetails       StudentDetails?
  registrations        StudentCourseRegistration[]
  results              Result[]
  schoolFees           SchoolFee[]
  payments             PaymentReceipt[]
  hostelBookings       HostelBooking[]
  notifications        Notification[]

  @@index([name])
}

model StudentDetails {
  id            Int       @id @default(autoincrement())
  studentId     Int       @unique
  dob           DateTime?
  gender        Gender
  address       String?
  phone         String?   @unique
  guardianName  String?
  guardianPhone String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  student       Student   @relation(fields: [studentId], references: [id], onDelete: Cascade, onUpdate: Cascade)
}

model Lecturer {
  id                     Int            @id @default(autoincrement())
  staffId                String         @unique
  name                   String
  departmentId           Int
  email                  String?        @unique
  phone                  String?        @unique
  role                   LecturerRole   @default(LECTURER)
  isActive               Boolean        @default(true)
  password               String
  profileImg             String?
  createdAt              DateTime       @default(now())
  updatedAt              DateTime       @updatedAt
  department             Department     @relation(fields: [departmentId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  staffCourses           StaffCourse[]
  notifications          Notification[]
  submittedScores        Score[]        @relation("ScoresSubmittedBy") // onDelete: SetNull is on Score side
  examinerApprovedScores Score[]        @relation("ScoresApprovedByExaminer") // onDelete: SetNull is on Score side
  hodAcceptedScores      Score[]        @relation("ScoresAcceptedByHOD") // onDelete: SetNull is on Score side
}

model ICTStaff {
  id                          Int      @id @default(autoincrement())
  staffId                     String   @unique
  name                        String
  email                       String   @unique
  phone                       String?  @unique
  isActive                    Boolean  @default(true)
  password                    String
  profileImg                  String?
  canManageCourses            Boolean  @default(false) // Using the simpler permission
  canManageCourseRegistration Boolean  @default(false) // Using the simpler permission
  canManageScores             Boolean  @default(false) // NEW
  canManageResults            Boolean  @default(false) // NEW
  canViewAnalytics            Boolean  @default(false)
  createdAt                   DateTime @default(now())
  updatedAt                   DateTime @updatedAt
}

model StaffCourse {
  id         Int      @id @default(autoincrement())
  lecturerId Int
  courseId   Int
  semesterId Int
  seasonId   Int
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  lecturer   Lecturer @relation(fields: [lecturerId], references: [id], onDelete: Cascade, onUpdate: Cascade)
  course     Course   @relation(fields: [courseId], references: [id], onDelete: Cascade, onUpdate: Cascade) // Or Restrict if you want to unassign first
  semester   Semester @relation(fields: [semesterId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  season     Season   @relation(fields: [seasonId], references: [id], onDelete: Restrict, onUpdate: Cascade)

  @@unique([lecturerId, courseId, semesterId, seasonId])
}

model Department {
  id             Int             @id @default(autoincrement())
  name           String          @unique
  facultyId      Int
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt
  faculty        Faculty         @relation(fields: [facultyId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  students       Student[]
  programs       Program[]
  lecturers      Lecturer[]
  courses        Course[]
  results        Result[]
  schoolFees     SchoolFee[]
  schoolFeeLists SchoolFeeList[]
}

model Faculty {
  id          Int          @id @default(autoincrement())
  name        String       @unique
  facultyCode String       @unique
  description String?
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
  departments Department[] // If Faculty deleted, Departments must be handled (due to Restrict on Department.facultyId)
}

model Program {
  id             Int             @id @default(autoincrement())
  programCode    String          @unique
  name           String
  degree         String
  degreeType     DegreeType
  duration       Int
  departmentId   Int
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt
  department     Department      @relation(fields: [departmentId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  programCourses ProgramCourse[]
  students       Student[]
  results        Result[]
  schoolFees     SchoolFee[]
  schoolFeeLists SchoolFeeList[]

  @@unique([name, degree, degreeType, departmentId], name: "unique_program_offering_in_department")
  @@unique([name], name: "unique_program_name_globally")
}

model Level {
  id                     Int                         @id @default(autoincrement())
  name                   String                      @unique // e.g., "100 Level", "200 Level"
  createdAt              DateTime                    @default(now())
  updatedAt              DateTime                    @updatedAt
  studentsAtEntryLevel   Student[]                   @relation("EntryLevel") // Students who entered at this level
  studentsAtCurrentLevel Student[]                   @relation("CurrentLevel") // Students currently at this level
  programCourses         ProgramCourse[]
  registrations          StudentCourseRegistration[]
  schoolFeeLists         SchoolFeeList[]
  Result                 Result[]
}

model Course {
  id                Int                         @id @default(autoincrement())
  code              String                      @unique
  title             String
  creditUnit        Int
  semesterId        Int?
  departmentId      Int
  courseType        CourseType                  @default(CORE)
  isActive          Boolean                     @default(true)
  createdAt         DateTime                    @default(now())
  updatedAt         DateTime                    @updatedAt
  semester          Semester?                   @relation(fields: [semesterId], references: [id], onDelete: SetNull, onUpdate: Cascade)
  department        Department                  @relation(fields: [departmentId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  programCourses    ProgramCourse[] // Will be deleted if this course is deleted due to ProgramCourse.onDelete: Cascade
  staffCourses      StaffCourse[] // Will be deleted if this course is deleted due to StaffCourse.onDelete: Cascade
  registrations     StudentCourseRegistration[] // Deletion restricted if this course has registrations
  prerequisites     CoursePrerequisite[]        @relation("CoursePrerequisites") // onDelete: Cascade is on CoursePrerequisite
  isPrerequisiteFor CoursePrerequisite[]        @relation("IsPrerequisiteForCourse") // onDelete: Cascade is on CoursePrerequisite

  @@index([title])
}

model CoursePrerequisite {
  id             Int @id @default(autoincrement())
  courseId       Int
  prerequisiteId Int

  course       Course @relation("CoursePrerequisites", fields: [courseId], references: [id], onDelete: Cascade, onUpdate: Cascade)
  prerequisite Course @relation("IsPrerequisiteForCourse", fields: [prerequisiteId], references: [id], onDelete: Cascade, onUpdate: Cascade)

  @@unique([courseId, prerequisiteId])
}

model ProgramCourse {
  id         Int      @id @default(autoincrement())
  programId  Int
  courseId   Int
  levelId    Int
  isElective Boolean  @default(false)
  isActive   Boolean  @default(true)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  program    Program  @relation(fields: [programId], references: [id], onDelete: Cascade, onUpdate: Cascade)
  course     Course   @relation(fields: [courseId], references: [id], onDelete: Cascade, onUpdate: Cascade)
  level      Level    @relation(fields: [levelId], references: [id], onDelete: Cascade, onUpdate: Cascade)

  @@unique([programId, courseId, levelId], name: "programCourseLevelUnique")
}

model Season {
  id                          Int                         @id @default(autoincrement())
  name                        String                      @unique
  isActive                    Boolean                     @default(false)
  isComplete                  Boolean                     @default(false)
  startDate                   DateTime?
  endDate                     DateTime?
  createdAt                   DateTime                    @default(now())
  updatedAt                   DateTime                    @updatedAt
  studentsAdmitted            Student[]                   @relation("AdmissionSeason") // Deletion restricted by Student.admissionSeasonId
  studentsCurrent             Student[]                   @relation("CurrentSeason") // Deletion restricted by Student.currentSeasonId (if SetNull, then ok)
  semesters                   Semester[] // Semesters will be deleted if Season is deleted due to Semester.seasonId onDelete: Cascade
  registrations               StudentCourseRegistration[] // Deletion restricted
  studentsGraduatedThisSeason Student[]                   @relation("GraduationSeason")
  results                     Result[] // Deletion restricted
  schoolFees                  SchoolFee[] // Deletion restricted
  schoolFeeLists              SchoolFeeList[] // Deletion restricted
  payments                    PaymentReceipt[] // Deletion restricted
  staffCourses                StaffCourse[] // Deletion restricted
  hostelBookings              HostelBooking[] // Deletion restricted
}

model Semester {
  id                            Int                         @id @default(autoincrement())
  name                          String
  seasonId                      Int
  type                          SemesterType
  semesterNumber                Int
  isActive                      Boolean                     @default(false)
  startDate                     DateTime?
  endDate                       DateTime?
  areStudentEditsLocked         Boolean                     @default(false)
  areLecturerScoreEditsLocked   Boolean                     @default(false)
  createdAt                     DateTime                    @default(now())
  updatedAt                     DateTime                    @updatedAt
  season                        Season                      @relation(fields: [seasonId], references: [id], onDelete: Cascade, onUpdate: Cascade) // Semesters gone if season is gone
  courses                       Course[] // If Course.semesterId is Restrict, this will block Semester deletion. If SetNull, ok.
  registrations                 StudentCourseRegistration[] // Restricted
  results                       Result[] // Restricted
  staffCourses                  StaffCourse[] // Restricted
  studentsAdmitted              Student[]                   @relation("AdmissionSemester") // Restricted
  studentsCurrent               Student[]                   @relation("CurrentSemester")
  studentsGraduatedThisSemester Student[]                   @relation("GraduationSemester")
  schoolFees                    SchoolFee[] // Restricted (if SchoolFee.semesterId is SetNull, ok)

  @@unique([name, seasonId])
  @@unique([type, seasonId])
  @@unique([semesterNumber, seasonId])
}

model StudentCourseRegistration {
  id              Int      @id @default(autoincrement())
  studentId       Int
  courseId        Int
  semesterId      Int
  levelId         Int
  seasonId        Int
  isScoreRecorded Boolean  @default(false)
  registeredAt    DateTime @default(now())
  student         Student  @relation(fields: [studentId], references: [id], onDelete: Cascade, onUpdate: Cascade) // If student deleted, their registrations are gone
  course          Course   @relation(fields: [courseId], references: [id], onDelete: Restrict, onUpdate: Cascade) // Don't delete course if registrations exist
  semester        Semester @relation(fields: [semesterId], references: [id], onDelete: Restrict, onUpdate: Cascade) // Don't delete semester if registrations exist
  level           Level    @relation(fields: [levelId], references: [id], onDelete: Restrict, onUpdate: Cascade) // Don't delete level if registrations exist for it
  season          Season   @relation(fields: [seasonId], references: [id], onDelete: Restrict, onUpdate: Cascade) // Don't delete season if registrations exist
  score           Score? // onDelete: Cascade is on Score side

  @@unique([studentId, courseId, semesterId, seasonId])
}

model Score {
  id                          Int                       @id @default(autoincrement())
  studentCourseRegistrationId Int                       @unique
  firstCA                     Float?
  secondCA                    Float?
  examScore                   Float?
  totalScore                  Float?
  grade                       GradeLetter?
  point                       Float?
  resultId                    Int?
  submittedByLecturerId       Int?
  submittedAt                 DateTime?
  isApprovedByExaminer        Boolean                   @default(false)
  examinerApprovedAt          DateTime?
  examinerWhoApprovedId       Int?
  isAcceptedByHOD             Boolean                   @default(false)
  hodAcceptedAt               DateTime?
  hodWhoAcceptedId            Int?
  createdAt                   DateTime                  @default(now())
  updatedAt                   DateTime                  @updatedAt
  studentCourseRegistration   StudentCourseRegistration @relation(fields: [studentCourseRegistrationId], references: [id], onDelete: Cascade, onUpdate: Cascade)
  result                      Result?                   @relation(fields: [resultId], references: [id], onDelete: SetNull, onUpdate: Cascade) // If result summary deleted, score FK becomes null
  submittedByLecturer         Lecturer?                 @relation("ScoresSubmittedBy", fields: [submittedByLecturerId], references: [id], onDelete: SetNull, onUpdate: Cascade)
  examinerWhoApproved         Lecturer?                 @relation("ScoresApprovedByExaminer", fields: [examinerWhoApprovedId], references: [id], onDelete: SetNull, onUpdate: Cascade)
  hodWhoAccepted              Lecturer?                 @relation("ScoresAcceptedByHOD", fields: [hodWhoAcceptedId], references: [id], onDelete: SetNull, onUpdate: Cascade)
}

model Result {
  id                              Int           @id @default(autoincrement())
  studentId                       Int
  semesterId                      Int
  seasonId                        Int
  departmentId                    Int
  programId                       Int
  levelId                         Int
  gpa                             Float?
  cgpa                            Float?
  cuAttempted                     Int?
  cuPassed                        Int?
  cuTotal                         Int?
  remarks                         ResultRemark?
  isApprovedForStudentRelease     Boolean       @default(false)
  studentReleaseApprovedAt        DateTime?
  studentReleaseApprovedByAdminId Int?
  createdAt                       DateTime      @default(now())
  updatedAt                       DateTime      @updatedAt
  student                         Student       @relation(fields: [studentId], references: [id], onDelete: Cascade, onUpdate: Cascade)
  semester                        Semester      @relation(fields: [semesterId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  season                          Season        @relation(fields: [seasonId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  department                      Department    @relation(fields: [departmentId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  program                         Program       @relation(fields: [programId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  level                           Level         @relation(fields: [levelId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  scores                          Score[] // If Result deleted, Score.resultId becomes null (due to Score side)
  studentReleaseApproverAdmin     Admin?        @relation("ResultsApprovedForReleaseByAdmin", fields: [studentReleaseApprovedByAdminId], references: [id], onDelete: SetNull, onUpdate: Cascade)

  @@unique([studentId, semesterId, seasonId])
}

model SchoolFee {
  id            Int              @id @default(autoincrement())
  studentId     Int
  seasonId      Int
  amount        Float
  amountPaid    Float            @default(0)
  balance       Float // This should be a calculated field in application logic
  paymentStatus PaymentStatus    @default(PENDING)
  semesterId    Int?
  dueDate       DateTime?
  createdAt     DateTime         @default(now())
  updatedAt     DateTime         @updatedAt
  student       Student          @relation(fields: [studentId], references: [id], onDelete: Cascade, onUpdate: Cascade)
  season        Season           @relation(fields: [seasonId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  semester      Semester?        @relation(fields: [semesterId], references: [id], onDelete: SetNull, onUpdate: Cascade)
  Department    Department?      @relation(fields: [departmentId], references: [id], onDelete: SetNull, onUpdate: Cascade) // If dept deleted, set null
  Program       Program?         @relation(fields: [programId], references: [id], onDelete: SetNull, onUpdate: Cascade) // If prog deleted, set null
  payments      PaymentReceipt[]
  departmentId  Int?
  programId     Int?

  @@unique([studentId, seasonId, semesterId])
}

model SchoolFeeList {
  id           Int         @id @default(autoincrement())
  levelId      Int
  departmentId Int?
  programId    Int?
  seasonId     Int
  amount       Float
  description  String?
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt
  level        Level       @relation(fields: [levelId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  department   Department? @relation(fields: [departmentId], references: [id], onDelete: SetNull, onUpdate: Cascade) // If dept deleted, set null
  program      Program?    @relation(fields: [programId], references: [id], onDelete: SetNull, onUpdate: Cascade) // If prog deleted, set null
  season       Season      @relation(fields: [seasonId], references: [id], onDelete: Restrict, onUpdate: Cascade)

  @@unique([levelId, departmentId, seasonId])
  @@unique([levelId, programId, seasonId])
}

model Notification {
  id            Int       @id @default(autoincrement())
  recipientType String
  recipientId   Int
  message       String
  isRead        Boolean   @default(false)
  createdAt     DateTime  @default(now())
  Student       Student?  @relation(fields: [studentId], references: [id], onDelete: Cascade, onUpdate: Cascade)
  studentId     Int?
  Lecturer      Lecturer? @relation(fields: [lecturerId], references: [id], onDelete: Cascade, onUpdate: Cascade)
  lecturerId    Int?
}

model Hostel {
  id        Int             @id @default(autoincrement())
  name      String          @unique
  capacity  Int
  gender    Gender?
  createdAt DateTime        @default(now())
  updatedAt DateTime        @updatedAt
  rooms     HostelRoom[] // If hostel deleted, rooms should cascade
  bookings  HostelBooking[] // If hostel deleted, bookings might be restricted or cascaded based on HostelBooking.hostelId
}

model HostelRoom {
  id          Int             @id @default(autoincrement())
  hostelId    Int
  roomNumber  String
  capacity    Int
  isAvailable Boolean         @default(true)
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt
  hostel      Hostel          @relation(fields: [hostelId], references: [id], onDelete: Cascade, onUpdate: Cascade)
  bookings    HostelBooking[] // If room deleted, bookings for it should cascade

  @@unique([hostelId, roomNumber])
}

model HostelBooking {
  id              Int                  @id @default(autoincrement())
  studentId       Int
  hostelId        Int
  roomId          Int
  seasonId        Int
  checkInDate     DateTime?
  checkOutDate    DateTime?
  amountPaid      Float                @default(0)
  paymentStatus   BookingPaymentStatus @default(PENDING)
  paymentDeadline DateTime?
  isActive        Boolean              @default(true)
  createdAt       DateTime             @default(now())
  updatedAt       DateTime             @updatedAt
  student         Student              @relation(fields: [studentId], references: [id], onDelete: Cascade, onUpdate: Cascade)
  hostel          Hostel               @relation(fields: [hostelId], references: [id], onDelete: Restrict, onUpdate: Cascade) // Don't delete hostel if active bookings
  room            HostelRoom           @relation(fields: [roomId], references: [id], onDelete: Restrict, onUpdate: Cascade) // Don't delete room if active bookings
  season          Season               @relation(fields: [seasonId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  payments        PaymentReceipt[]

  @@unique([studentId, seasonId])
  @@unique([roomId, seasonId, isActive]) // This unique constraint is good
}

model PaymentReceipt {
  id              Int             @id @default(autoincrement())
  studentId       Int
  schoolFeeId     Int?
  hostelBookingId Int?
  amountPaid      Float
  paymentDate     DateTime        @default(now())
  reference       String          @unique
  channel         PaymentChannel?
  seasonId        Int
  description     String?
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt
  student         Student         @relation(fields: [studentId], references: [id], onDelete: Restrict, onUpdate: Cascade) // Payment history is critical, Restrict deletion of student if payments exist
  schoolFee       SchoolFee?      @relation(fields: [schoolFeeId], references: [id], onDelete: SetNull, onUpdate: Cascade) // If original SchoolFee bill is deleted, keep receipt but orphan link
  hostelBooking   HostelBooking?  @relation(fields: [hostelBookingId], references: [id], onDelete: SetNull, onUpdate: Cascade)
  season          Season          @relation(fields: [seasonId], references: [id], onDelete: Restrict, onUpdate: Cascade)
}

model ApplicationSetting {
  id          Int      @id @default(autoincrement())
  key         String   @unique
  value       String
  description String?
  type        String? // e.g., "INTEGER", "BOOLEAN", "STRING", "JSON"
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

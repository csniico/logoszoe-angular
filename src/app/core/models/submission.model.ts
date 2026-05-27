export interface SubmissionListItem {
  _id: string;
  courseId: string;
  courseTitle: string;
  lessonId: string;
  lessonTitle: string;
  userId: string;
  learnerName: string;
  learnerEmail: string;
  responses: { questionId: string; userResponse: string }[];
  remarkCount: number;
  unreadReplies: number;
  createdAt: string;
}

export interface Remark {
  _id: string;
  submissionId: string;
  authorId: string;
  authorName: string;
  authorRole: 'admin' | 'learner';
  content: string;
  readByLearner: boolean;
  createdAt: string;
}

export interface SubmissionDetail {
  _id: string;
  courseId: string;
  courseTitle: string;
  lessonId: string;
  lessonTitle: string;
  learnerName: string;
  learnerEmail: string;
  responses: {
    questionId: string;
    questionText: string;
    questionType: 'multiple_choice' | 'text_input';
    userResponse: string;
    correctOption?: string;
    isCorrect: boolean | null;
  }[];
  createdAt: string;
}

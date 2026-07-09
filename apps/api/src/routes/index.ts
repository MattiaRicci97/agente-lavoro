import { Router, type IRouter } from "express";
import healthRouter from "./health";
import storageRouter from "./storage";
import authRouter from "./auth";
import materialsRouter from "./materials";
import questionsRouter from "./questions";
import quizRouter from "./quiz";
import oralRouter from "./oral";
import analyticsRouter from "./analytics";
import institutionsRouter from "./institutions";
import classesRouter from "./classes";
import writtenExamsRouter from "./writtenExams";
import reviewItemsRouter from "./reviewItems";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storageRouter);
router.use(authRouter);
router.use(materialsRouter);
router.use(questionsRouter);
router.use(quizRouter);
router.use(oralRouter);
router.use(analyticsRouter);
router.use(institutionsRouter);
router.use(classesRouter);
router.use(writtenExamsRouter);
router.use(reviewItemsRouter);

export default router;

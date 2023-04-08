import { Router, Request, Response } from 'express';
import { NoResultError } from 'kysely';
import { DatabaseError } from 'pg';

import db from '../../db';
import { IDValidator, getAuthValidator, itemValidator } from '../middlewares';
import { ItemSchema, itemSchema } from '../../schemas';
import { createValidator } from '../middlewares/requestValidator';

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    res.json({ items: await db.selectFrom('item').selectAll().execute() });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', IDValidator, async (req, res, next) => {
  try {
    res.json({
      item: await db.selectFrom('item').selectAll()
        .where('id', '=', Number(req.params.id))
        .executeTakeFirstOrThrow(),
    });
  } catch (error) {
    if (error instanceof NoResultError) {
      res.status(404);
    }
    next(error);
  }
});

router.post(
  '/',
  getAuthValidator('donation_center'),
  itemValidator,
  async (req: Request<{}, {}, Omit<ItemSchema, 'id'>>, res: Response, next) => {
    try {
      if (req.body.donation_center_id !== res.locals.donation_center.id) {
        res.status(403);
        throw new Error('Forbidden');
      }
      res.json({
        item: await db.insertInto('item')
          .values(req.body)
          .returningAll()
          .executeTakeFirstOrThrow(),
      });
    } catch (error) {
      if (error instanceof DatabaseError) {
        res.status(400);
      }
      next(error);
    }
  },
);

router.patch(
  '/:id',
  getAuthValidator('donation_center'),
  IDValidator,
  createValidator({ body: itemSchema.omit({ id: true }).partial() }),
  async (req: Request<{ id: string }, {}, Omit<ItemSchema, 'id'>>, res, next) => {
    try {
      res.json({
        item: await db.updateTable('item').set(req.body)
          .where('id', '=', Number(req.params.id))
          .where('donation_center_id', '=', res.locals.donation_center.id)
          .returningAll()
          .executeTakeFirstOrThrow(),
      });
    } catch (error) {
      if (error instanceof NoResultError) {
        res.status(403);
        next(new Error('Forbidden'));
        return;
      }
      if (error instanceof DatabaseError) {
        res.status(400);
      }
      next(error);
    }
  },
);

router.delete(
  '/:id',
  getAuthValidator('donation_center'),
  IDValidator,
  async (req, res, next) => {
    try {
      res.json({
        item: await db.deleteFrom('item')
          .where('item.id', '=', Number(req.params.id))
          .where('donation_center_id', '=', res.locals.donation_center.id)
          .returningAll()
          .executeTakeFirstOrThrow(),
      });
    } catch (error) {
      if (error instanceof NoResultError) {
        res.status(403);
        next(new Error('Forbidden'));
        return;
      }
      next(error);
    }
  },
);

export default router;
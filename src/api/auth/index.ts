import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { NoResultError } from 'kysely';
import z from 'zod';
import { DatabaseError } from 'pg';

import db from '../../db';
import {
  AccountSchema,
  accountSchema,
  donationCenterSchema,
  userSchema,
} from '../../schemas';
import { IDValidator, getAuthValidator } from '../middlewares';
import { generateJWT, saltRounds, getDuplicateProperty } from '../utils';
import { createValidator } from '../middlewares/requestValidator';

const router = Router();

const signupBodySchema = z.object({
  account: accountSchema.omit({ id: true }),
  profile: donationCenterSchema.omit({ id: true }).or(userSchema.omit({ id: true })),
});
const signupQuerySchema = z.object({
  role: z.enum(['donation_center', 'user']),
}).strict();
type SignupRequest =
  Request<{}, {}, z.infer<typeof signupBodySchema>, z.infer<typeof signupQuerySchema>>;

router.post(
  '/signup',
  createValidator({
    query: signupQuerySchema,
    body: signupBodySchema,
  }),
  async (req: SignupRequest, res: Response, next) => {
    try {
      const inserted = await db.transaction().execute(async (trx) => {
        const { password, ...insertedAccount } = await trx.insertInto('account')
          .values({
            ...req.body.account,
            password: await bcrypt.hash(req.body.account.password, saltRounds),
          }).returningAll().executeTakeFirstOrThrow();

        const insertedProfile = await trx.insertInto(req.query.role).values({
          ...req.body.profile,
          id: insertedAccount.id,
        }).returningAll().executeTakeFirstOrThrow();

        return {
          account: insertedAccount,
          profile: insertedProfile,
        };
      });

      res.json({
        ...inserted,
        token: generateJWT(inserted.account.id),
      });
    } catch (error) {
      if (error instanceof DatabaseError) {
        const duplicateProperty = getDuplicateProperty(error);
        if (duplicateProperty !== null) {
          res.status(duplicateProperty === 'email' ? 400 : 409);
          next(new Error(`Duplicate ${duplicateProperty}`));
          return;
        }
      }
      next(error);
    }
  },
);

const loginValidator = createValidator({
  body: accountSchema.pick({ email: true, password: true }),
});

router.post('/login', loginValidator, async (req: Request<{}, {}, Pick<AccountSchema, 'email' | 'password'>>, res: Response, next) => {
  try {
    const { password, ...account } = await db.selectFrom('account').selectAll()
      .where('email', '=', req.body.email).executeTakeFirstOrThrow();

    if (!await bcrypt.compare(req.body.password, password)) {
      throw new EvalError();
    }

    res.json({
      account,
      token: generateJWT(account.id),
    });
  } catch (error) {
    if (error instanceof NoResultError || error instanceof EvalError) {
      res.status(400);
      next(new Error('Invalid credentials'));
    } else {
      next(error);
    }
  }
});

router.get('/test', getAuthValidator('account'), async (_req, res) => {
  res.json({
    status: 'Authorized',
  });
});

router.delete(
  '/:id',
  IDValidator,
  loginValidator,
  async (req: Request<{ id: string }, {}, Pick<AccountSchema, 'email' | 'password'>>, res: Response, next) => {
    try {
      const { password, ...account } = await db.deleteFrom('account')
        .where('id', '=', Number(req.params.id))
        .returningAll().executeTakeFirstOrThrow();
      res.json({ account });
    } catch (error) {
      if (error instanceof NoResultError) {
        res.status(404);
      }
      next(error);
    }
  },
);

export default router;
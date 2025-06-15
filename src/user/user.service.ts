import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';

import { PG_CONNECTION, PGConnection } from 'src/common/pg.constant';
import {
  CreateUser,
  GetAllUsersResponse,
  TopUpRequest,
  TopUpResponse,
  TransferRequest,
  TransferResponse,
  UpdateUser,
  UserResponse,
} from 'src/model/user-module';
import { ValidationService } from 'src/common/validation.service';
import { UserValidation } from './user.validation';

@Injectable()
export class UserService {
  constructor(
    private readonly validationService: ValidationService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    @Inject(PG_CONNECTION) private readonly db: PGConnection,
  ) {}

  async createUser(request: CreateUser): Promise<UserResponse> {
    this.logger.debug(`Create new user: ${JSON.stringify(request)}`);

    const validated = this.validationService.validate(
      UserValidation.CREATE,
      request,
    ) as CreateUser;

    const existingName = await this.db.query(
      `SELECT id FROM users WHERE LOWER(name) = LOWER($1)`,
      [validated.name],
    );

    if (existingName.rowCount > 0) {
      throw new BadRequestException(`Nama "${validated.name}" sudah digunakan`);
    }

    const existingAccount = await this.db.query(
      `SELECT id FROM users WHERE account_number = $1`,
      [validated.account_number],
    );
    if (existingAccount.rowCount > 0) {
      throw new BadRequestException(
        `Nomor rekening "${validated.account_number}" sudah digunakan`,
      );
    }

    const insertQuery = `
    INSERT INTO users (id, name, bank, account_number, balance, created_at, updated_at)
    VALUES (gen_random_uuid(), $1, $2, $3, 0, now(), now())
    RETURNING id
  `;
    const values = [validated.name, validated.bank, validated.account_number];
    const insertResult = await this.db.query(insertQuery, values);
    const newUserId = insertResult.rows[0].id;

    await this.db.query(
      `UPDATE users SET created_by = $1, updated_by = $1 WHERE id = $1`,
      [newUserId],
    );

    const userResult = await this.db.query(
      `SELECT name, bank, account_number FROM users WHERE id = $1`,
      [newUserId],
    );

    return userResult.rows[0] as UserResponse;
  }

  async updateUser(request: UpdateUser): Promise<UserResponse> {
    this.logger.debug(`Update user: ${JSON.stringify(request)}`);

    const validated = this.validationService.validate(
      UserValidation.UPDATE,
      request,
    ) as UpdateUser;

    const duplicateCheckQuery = `
    SELECT id FROM users WHERE name = $1 AND id != $2
  `;
    const duplicateResult = await this.db.query(duplicateCheckQuery, [
      validated.name,
      validated.id,
    ]);

    if (duplicateResult.rowCount > 0) {
      throw new BadRequestException(`Nama "${validated.name}" sudah digunakan`);
    }

    const updateQuery = `
    UPDATE users
    SET name = $1,
        updated_at = now()
    WHERE id = $2
    RETURNING id, name, bank, account_number
  `;
    const values = [validated.name, validated.id];
    const result = await this.db.query(updateQuery, values);

    if (result.rowCount === 0) {
      throw new NotFoundException(
        `User dengan id ${validated.id} tidak ditemukan`,
      );
    }

    return result.rows[0] as UserResponse;
  }

  async transfer(request: TransferRequest): Promise<TransferResponse> {
    this.logger.debug(`Transfer request: ${JSON.stringify(request)}`);

    const validated = this.validationService.validate(
      UserValidation.TRANSFEER,
      request,
    ) as TransferRequest;

    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      const senderResult = await client.query(
        `SELECT id, balance FROM users WHERE id = $1 FOR UPDATE`,
        [validated.senderId],
      );
      if (senderResult.rowCount === 0) {
        throw new BadRequestException('Pengirim tidak ditemukan');
      }
      const sender = senderResult.rows[0];

      if (sender.balance < validated.amount) {
        throw new BadRequestException('Saldo tidak mencukupi');
      }

      const recipientResult = await client.query(
        `SELECT id, balance FROM users WHERE name = $1 FOR UPDATE`,
        [validated.recipientName],
      );
      if (recipientResult.rowCount === 0) {
        throw new BadRequestException('Penerima tidak ditemukan');
      }
      const recipient = recipientResult.rows[0];

      await client.query(
        `UPDATE users SET balance = balance - $1, updated_at = now() WHERE id = $2`,
        [validated.amount, sender.id],
      );

      await client.query(
        `UPDATE users SET balance = balance + $1, updated_at = now() WHERE id = $2`,
        [validated.amount, recipient.id],
      );

      const insertTransfer = await client.query(
        `INSERT INTO transfers (id, sender_id, receiver_id, amount, created_by, updated_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $1, $1, now(), now())
       RETURNING id`,
        [sender.id, recipient.id, validated.amount],
      );

      await client.query('COMMIT');

      return {
        transferId: insertTransfer.rows[0].id,
        senderId: sender.id,
        recipientId: recipient.id,
        amount: validated.amount,
      };
    } catch (error: any) {
      await client.query('ROLLBACK');
      this.logger.error(`Transfer failed: ${error.message || error}`);

      throw new BadRequestException(
        error.message || 'Terjadi kesalahan pada server',
      );
    } finally {
      client.release();
    }
  }

  async topUp(request: TopUpRequest): Promise<TopUpResponse> {
    this.logger.debug(`TopUp request: ${JSON.stringify(request)}`);

    const validated = this.validationService.validate(
      UserValidation.TOPUP,
      request,
    ) as TopUpRequest;

    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      const userResult = await client.query(
        `SELECT id, balance FROM users WHERE id = $1 FOR UPDATE`,
        [validated.id],
      );

      if (userResult.rowCount === 0) {
        throw new Error('User not found');
      }

      const updatedBalanceResult = await client.query(
        `UPDATE users 
       SET balance = balance + $1, updated_at = now(), updated_by = $2 
       WHERE id = $3 
       RETURNING balance`,
        [validated.amount, validated.id, validated.id],
      );
      const newBalance = updatedBalanceResult.rows[0].balance;

      const insertTopUp = await client.query(
        `INSERT INTO top_ups (id, user_id, amount, created_by, updated_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $1, $1, now(), now())
       RETURNING id`,
        [validated.id, validated.amount],
      );

      await client.query('COMMIT');

      return {
        topUpId: insertTopUp.rows[0].id,
        userId: validated.id,
        amount: validated.amount,
        newBalance,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error(`TopUp failed: ${error.message}`);
      throw error;
    } finally {
      client.release();
    }
  }

  async findUsersWithOptionalSearch(
    type?: string,
    keyword?: string,
    startDate?: string,
    endDate?: string,
  ): Promise<GetAllUsersResponse> {
    this.logger.debug(
      `Searching users with type: ${type}, keyword: ${keyword}, startDate: ${startDate}, endDate: ${endDate}`,
    );

    const keywordExist = type && keyword;

    if (!type || (type === 'wallet' && !keyword)) {
      this.logger.debug('Fetching all users with summary (wallet mode)');

      const usersResult = await this.db.query(`
      SELECT id, name, bank, balance FROM users
    `);

      const summaryResult = await this.db.query(`
      SELECT COUNT(*) AS total_users, COALESCE(SUM(balance), 0) AS total_balance FROM users
    `);

      return {
        users: usersResult.rows,
        totalUsers: parseInt(
          String(summaryResult.rows[0]?.total_users ?? '0'),
          10,
        ),
        totalBalance: parseInt(
          String(summaryResult.rows[0]?.total_balance ?? '0'),
          10,
        ),
      };
    }

    let startDateTime: string | undefined;
    let endDateTime: string | undefined;
    if (startDate && endDate) {
      startDateTime = new Date(`${startDate}T00:00:00Z`).toISOString();
      endDateTime = new Date(`${endDate}T23:59:59Z`).toISOString();
      this.logger.debug(
        `Converted startDate: ${startDateTime}, endDate: ${endDateTime}`,
      );
    }

    if (type === 'saldo' && !keywordExist && startDateTime && endDateTime) {
      const result = await this.db.query(
        `
      SELECT id, name, bank, balance, TO_CHAR(created_at, 'DD FMMonth YYYY') AS created_at
      FROM users
      WHERE created_at BETWEEN $1 AND $2
      ORDER BY created_at DESC
    `,
        [startDateTime, endDateTime],
      );

      return {
        users: result.rows,
        totalUsers: result.rowCount ?? 0,
        totalBalance: 0,
      };
    }

    if (type === 'topup' && !keywordExist && startDateTime && endDateTime) {
      const result = await this.db.query(
        `
      SELECT u.id, u.name, TO_CHAR(t.created_at, 'DD FMMonth YYYY') AS created_at, t.amount
      FROM top_ups t
      JOIN users u ON u.id = t.user_id
      WHERE t.updated_at IS NOT NULL AND t.created_at BETWEEN $1 AND $2
      ORDER BY t.created_at DESC
    `,
        [startDateTime, endDateTime],
      );

      return {
        users: result.rows,
        totalUsers: result.rowCount ?? 0,
        totalBalance: 0,
      };
    }

    if (type === 'transfer' && !keywordExist && startDateTime && endDateTime) {
      const result = await this.db.query(
        `
      SELECT 
        s.id AS sender_id,
        s.name AS sender_name,
        r.id AS receiver_id,
        r.name AS receiver_name,
        TO_CHAR(t.created_at, 'DD FMMonth YYYY') AS created_at,
        t.amount
      FROM transfers t
      JOIN users s ON s.id = t.sender_id
      JOIN users r ON r.id = t.receiver_id
      WHERE t.created_at BETWEEN $1 AND $2
      ORDER BY t.created_at DESC
    `,
        [startDateTime, endDateTime],
      );

      return {
        users: result.rows,
        totalUsers: result.rowCount ?? 0,
        totalBalance: 0,
      };
    }

    // ====== SEARCH MODE ======

    const normalized = keyword || '';
    const keywordLike = `%${normalized.toLowerCase()}%`;
    const values: any[] = [keywordLike];

    let dateClause = '';
    if (startDateTime && endDateTime) {
      values.push(startDateTime, endDateTime);
      dateClause = `AND t.created_at BETWEEN $${values.length - 1} AND $${values.length}`;
    }

    let searchQuery = '';

    switch (type) {
      case 'wallet':
        searchQuery = `
        SELECT id, name, bank, balance
        FROM users
        WHERE (
          LOWER(name) LIKE $1
          OR LOWER(bank) LIKE $1
          OR CAST(balance AS TEXT) LIKE $1
          OR TO_CHAR(created_at, 'DD FMMonth YYYY') ILIKE $1
        )
      `;
        if (startDateTime && endDateTime) {
          searchQuery += ` AND created_at BETWEEN $2 AND $3`;
        }
        break;

      case 'saldo':
        searchQuery = `
        SELECT id, name, bank, balance, TO_CHAR(created_at, 'DD FMMonth YYYY') AS created_at
        FROM users
        WHERE (
          LOWER(name) LIKE $1
          OR CAST(balance AS TEXT) LIKE $1
          OR TO_CHAR(created_at, 'DD FMMonth YYYY') ILIKE $1
          OR LOWER(bank) LIKE $1
        )
      `;
        if (startDateTime && endDateTime) {
          searchQuery += ` AND created_at BETWEEN $2 AND $3`;
        }
        break;

      case 'topup':
        searchQuery = `
        SELECT u.id, u.name, t.amount, TO_CHAR(t.created_at, 'DD FMMonth YYYY') AS created_at
        FROM top_ups t
        JOIN users u ON u.id = t.user_id
        WHERE (
          LOWER(u.name) LIKE $1
          OR CAST(t.amount AS TEXT) LIKE $1
          OR TO_CHAR(t.created_at, 'DD FMMonth YYYY') ILIKE $1
        )
        ${dateClause}
      `;
        break;

      case 'transfer':
        searchQuery = `
        SELECT 
          s.id AS sender_id,
          s.name AS sender_name,
          r.id AS receiver_id,
          r.name AS receiver_name,
          t.amount,
          TO_CHAR(t.created_at, 'DD FMMonth YYYY') AS created_at
        FROM transfers t
        JOIN users s ON s.id = t.sender_id
        JOIN users r ON r.id = t.receiver_id
        WHERE (
          LOWER(s.name) LIKE $1
          OR LOWER(r.name) LIKE $1
          OR TO_CHAR(t.created_at, 'DD FMMonth YYYY') ILIKE $1
          OR CAST(t.amount AS TEXT) LIKE $1
        )
        ${dateClause}
      `;
        break;

      default:
        throw new Error('Invalid search type');
    }

    const result = await this.db.query(searchQuery, values);

    const summary = await this.db.query(`
    SELECT COUNT(*) AS total_users, COALESCE(SUM(balance), 0) AS total_balance FROM users
  `);

    return {
      users: result.rows,
      totalUsers: parseInt(String(summary.rows[0]?.total_users ?? '0'), 10),
      totalBalance: parseInt(String(summary.rows[0]?.total_balance ?? '0'), 10),
    };
  }
}

import { Module } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_CONNECTION } from './pg.constant';

@Module({
  providers: [
    {
      provide: PG_CONNECTION,
      useFactory: (): unknown => {
        return new Pool({
          connectionString: process.env.DATABASE_URL,
        }) as unknown;
      },
    },
  ],
  exports: [PG_CONNECTION],
})
export class DatabaseModule {}

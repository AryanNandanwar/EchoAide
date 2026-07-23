import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { INTEGRATION_ENTITIES } from './integration-test.helper';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: ':memory:',
      entities: INTEGRATION_ENTITIES,
      synchronize: true,
      logging: false,
    }),
  ],
  providers: [
    {
      provide: 'POSTGRES_DATA_SOURCE',
      useFactory: (dataSource: DataSource) => dataSource,
      inject: [DataSource],
    },
  ],
  exports: ['POSTGRES_DATA_SOURCE'],
})
export class TestDatabaseModule {}

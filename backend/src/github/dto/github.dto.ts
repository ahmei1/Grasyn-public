import { ApiProperty } from '@nestjs/swagger';
import { IsString, ValidateIf } from 'class-validator';

export class MapRepositoryDto {
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Project that shows this repository; null to unassign',
  })
  @ValidateIf((_, value) => value !== null)
  @IsString()
  projectId!: string | null;
}

import { IsOptional, IsString } from "class-validator";
import { PaginationQueryDto } from "../../common/dto/pagination-query.dto";

const SORTABLE_FIELDS = ["createdAt", "name", "status"] as const;
const SORT_DIRECTIONS = ["asc", "desc"] as const;

export class DeviceQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  type?: string;

  /** Format: "field:direction", e.g. "createdAt:desc". Defaults to createdAt:desc. */
  @IsOptional()
  @IsString()
  sort?: string;

  parseSort(): { field: (typeof SORTABLE_FIELDS)[number]; direction: (typeof SORT_DIRECTIONS)[number] } {
    const [field, direction] = (this.sort ?? "createdAt:desc").split(":");

    return {
      field: SORTABLE_FIELDS.includes(field as (typeof SORTABLE_FIELDS)[number])
        ? (field as (typeof SORTABLE_FIELDS)[number])
        : "createdAt",
      direction: SORT_DIRECTIONS.includes(direction as (typeof SORT_DIRECTIONS)[number])
        ? (direction as (typeof SORT_DIRECTIONS)[number])
        : "desc",
    };
  }
}

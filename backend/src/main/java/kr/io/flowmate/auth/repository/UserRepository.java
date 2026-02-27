package kr.io.flowmate.auth.repository;

import kr.io.flowmate.auth.domain.User;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, String> {
}

package kr.io.flowmate.auth.repository;

import kr.io.flowmate.auth.domain.SocialAccount;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface SocialAccountRepository extends JpaRepository<SocialAccount, String> {
    Optional<SocialAccount> findByProviderAndProviderUserId(String provider, String providerUserId);
}
